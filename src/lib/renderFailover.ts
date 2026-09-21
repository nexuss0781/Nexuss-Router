const RENDER_URL = (process.env.RENDER_SERVICE_URL || "").trim().replace(/\/+$/, "");
const RENDER_HEALTH_PATH = process.env.RENDER_HEALTH_PATH?.trim() || "/health";
const HEALTH_TIMEOUT_MS = Number(process.env.RENDER_HEALTH_TIMEOUT_MS || 1500);
const FORWARD_TIMEOUT_MS = Number(process.env.RENDER_FORWARD_TIMEOUT_MS || 300000);
const FORWARD_HEADER = "x-omniroute-forwarded";

export type RenderHealth = {
  healthy: boolean;
  url: string | null;
  latencyMs?: number;
  reason?: string;
};

function enabled(): boolean {
  return Boolean(RENDER_URL) && process.env.RENDER_FORWARDING_DISABLED !== "true";
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
  if (!enabled()) return { healthy: false, url: null, reason: "not_configured" };
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(`${RENDER_URL}${RENDER_HEALTH_PATH}`, { method: "GET", headers: { accept: "application/json" } }, HEALTH_TIMEOUT_MS);
    if (!response.ok) return { healthy: false, url: RENDER_URL, latencyMs: Date.now() - started, reason: `http_${response.status}` };
    return { healthy: true, url: RENDER_URL, latencyMs: Date.now() - started };
  } catch (error) {
    return { healthy: false, url: RENDER_URL, latencyMs: Date.now() - started, reason: error instanceof Error ? error.name : "health_check_failed" };
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

/** Check Render on every eligible request, then forward only when it is healthy. */
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
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set("x-omniroute-execution", "render");
    responseHeaders.set("x-omniroute-render-latency-ms", String(health.latencyMs ?? 0));
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    // Render may go idle between the health probe and the forward. Falling back
    // to the existing Vercel handler keeps the first hop available.
    return null;
  }
}

export async function renderStatus(): Promise<Response> {
  const health = await checkRenderHealth();
  return Response.json({ ok: true, render: health, forwarding: enabled() });
}

export const renderForwardHeader = FORWARD_HEADER;
