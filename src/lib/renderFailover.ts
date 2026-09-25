const RENDER_URL = (process.env.RENDER_SERVICE_URL || "").trim().replace(/\/+$/, "");
const RENDER_HEALTH_PATH = process.env.RENDER_HEALTH_PATH?.trim() || "/health";
const HEALTH_TIMEOUT_MS = Number(process.env.RENDER_HEALTH_TIMEOUT_MS || 1500);
const FORWARD_TIMEOUT_MS = Number(process.env.RENDER_FORWARD_TIMEOUT_MS || 300000);
const UNHEALTHY_COOLDOWN_MS = Math.max(0, Number(process.env.RENDER_UNHEALTHY_COOLDOWN_MS || 60000));
const FORWARD_HEADER = "x-omniroute-forwarded";

export type RenderHealth = {
  healthy: boolean;
  url: string | null;
  latencyMs?: number;
  reason?: string;
  lastFailureReason?: string | null;
  consecutiveFailures?: number;
  cooldownRemainingMs?: number;
};

let consecutiveFailures = 0;
let unhealthyUntil = 0;
let lastFailureReason: string | null = null;

function enabled(): boolean {
  return Boolean(RENDER_URL) && process.env.RENDER_FORWARDING_DISABLED !== "true";
}

function cooldownRemainingMs(): number {
  return Math.max(0, unhealthyUntil - Date.now());
}

function noteFailure(reason: string): void {
  consecutiveFailures += 1;
  lastFailureReason = reason;
  unhealthyUntil = Date.now() + UNHEALTHY_COOLDOWN_MS;
}

function noteSuccess(): void {
  consecutiveFailures = 0;
  unhealthyUntil = 0;
  lastFailureReason = null;
}

function healthSnapshot(healthy: boolean, extra: Partial<RenderHealth> = {}): RenderHealth {
  return {
    healthy,
    url: RENDER_URL || null,
    lastFailureReason,
    consecutiveFailures,
    cooldownRemainingMs: cooldownRemainingMs(),
    ...extra,
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkRenderHealth(): Promise<RenderHealth> {
  if (!enabled()) return { healthy: false, url: null, reason: "not_configured", lastFailureReason, consecutiveFailures, cooldownRemainingMs: 0 };
  const cooling = cooldownRemainingMs();
  if (cooling > 0) return healthSnapshot(false, { reason: `cooldown_${cooling}ms` });
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${RENDER_URL}${RENDER_HEALTH_PATH}`, { method: "GET", headers: { accept: "application/json" } }, HEALTH_TIMEOUT_MS);
    if (!response.ok) {
      const reason = `http_${response.status}`;
      noteFailure(`health_${reason}`);
      return healthSnapshot(false, { latencyMs: Date.now() - started, reason });
    }
    return healthSnapshot(true, { latencyMs: Date.now() - started });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "health_check_failed";
    noteFailure(`health_${reason}`);
    return healthSnapshot(false, { latencyMs: Date.now() - started, reason: `health_${reason}` });
  }
}

function forwarded(request: Request): boolean {
  return request.headers.get(FORWARD_HEADER) === "1";
}

function copyHeaders(request: Request): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!new Set(["connection", "content-length", "host", "transfer-encoding"]).has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set(FORWARD_HEADER, "1");
  headers.set("x-omniroute-forwarded-from", "vercel");
  return headers;
}

/**
 * Check Render before every eligible request, then forward only when it is
 * healthy. A 5xx never reaches the caller: it opens a cooldown so the local
 * handler answers until Render proves it can serve requests again, because the
 * liveness probe can return 200 while every real route is failing.
 */
export async function maybeForwardToRender(request: Request): Promise<Response | null> {
  if (!enabled() || forwarded(request)) return null;
  const health = await checkRenderHealth();
  if (!health.healthy) return null;
  try {
    const upstream = await fetchWithTimeout(`${RENDER_URL}${new URL(request.url).pathname}${new URL(request.url).search}`, {
      method: request.method,
      headers: copyHeaders(request),
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.clone().arrayBuffer(),
      redirect: "manual",
    }, FORWARD_TIMEOUT_MS);
    if (upstream.status >= 500) {
      noteFailure(`http_${upstream.status}`);
      try { await upstream.body?.cancel(); } catch { }
      return null;
    }
    noteSuccess();
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("x-omniroute-execution", "render");
    responseHeaders.set("x-omniroute-render-latency-ms", String(health.latencyMs ?? 0));
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch (error) {
    // Render may go idle between the health probe and the forward. Falling back
    // to the existing Vercel handler keeps the first hop available.
    noteFailure(error instanceof Error ? `forward_${error.name}` : "forward_failed");
    return null;
  }
}

export function lastRenderSkipReason(): string | null {
  return lastFailureReason;
}

export async function renderStatus(): Promise<Response> {
  const health = await checkRenderHealth();
  return Response.json({ ok: true, render: health, forwarding: enabled() });
}

export const renderForwardHeader = FORWARD_HEADER;
