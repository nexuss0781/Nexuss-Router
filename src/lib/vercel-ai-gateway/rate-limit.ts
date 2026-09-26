export type RateLimitProvider = { id: string; baseUrl: string };

export type RateLimit = {
  requestsPerMinute?: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  inputTokensPerMinute?: number;
  source?: string;
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export const PROVIDER_RATE_LIMITS: Record<string, RateLimit> = {
  "kilo-gateway": {},
  groq: { requestsPerMinute: 1000, tokensPerMinute: 8000, inputTokensPerMinute: 7000, source: "measured" },
  openrouter: { requestsPerMinute: 20, requestsPerDay: 50, source: "measured" },
  // Inception returns no rate-limit headers and publishes no numeric ceiling, so
  // there is nothing to enforce and the route is never skipped for budget.
  inception: {},
};

type Window = { count: number; resetAt: number };
type Kind = "rpm" | "rpd" | "tpm" | "itpm";

const windows = new Map<string, Window>();

function utcDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

function windowKey(providerId: string, model: string, kind: Kind): string {
  return `${providerId}|${model}|${kind}`;
}

function read(key: string, span: number, now: number): Window {
  const current = windows.get(key);
  if (current && current.resetAt > now) return current;
  const fresh: Window = { count: 0, resetAt: span === DAY_MS ? utcDayStart(now) + DAY_MS : now + span };
  windows.set(key, fresh);
  return fresh;
}

export function rateLimitFor(providerId: string): RateLimit | null {
  return PROVIDER_RATE_LIMITS[providerId] ?? null;
}

function exhausted(providerId: string, model: string, now = Date.now()): boolean {
  const limit = rateLimitFor(providerId);
  if (!limit) return false;
  const checks: [Kind, number | undefined, number][] = [
    ["rpm", limit.requestsPerMinute, MINUTE_MS],
    ["rpd", limit.requestsPerDay, DAY_MS],
    ["tpm", limit.tokensPerMinute, MINUTE_MS],
    ["itpm", limit.inputTokensPerMinute, MINUTE_MS],
  ];
  for (const [kind, cap, span] of checks) {
    if (cap === undefined || cap <= 0) continue;
    if (read(windowKey(providerId, model, kind), span, now).count >= cap) return true;
  }
  return false;
}

export function isRateLimitExhausted(provider: RateLimitProvider, model: string): boolean {
  return exhausted(provider.id, model);
}

export function consumeRateLimit(provider: RateLimitProvider, model: string, usage: { inputTokens?: number; outputTokens?: number } = {}): void {
  const limit = rateLimitFor(provider.id);
  if (!limit) return;
  const now = Date.now();
  const key = (kind: Kind) => windowKey(provider.id, model, kind);
  if (limit.requestsPerMinute) read(key("rpm"), MINUTE_MS, now).count += 1;
  if (limit.requestsPerDay) read(key("rpd"), DAY_MS, now).count += 1;
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  if (limit.tokensPerMinute) read(key("tpm"), MINUTE_MS, now).count += input + output;
  if (limit.inputTokensPerMinute) read(key("itpm"), MINUTE_MS, now).count += input;
}

export function noteRateLimitRejected(provider: RateLimitProvider, model: string, resetAtMs?: number): void {
  const limit = rateLimitFor(provider.id);
  if (!limit) return;
  const now = Date.now();
  const until = resetAtMs && resetAtMs > now ? resetAtMs : now + MINUTE_MS;
  for (const [kind, cap, span] of [
    ["rpm", limit.requestsPerMinute, MINUTE_MS],
    ["rpd", limit.requestsPerDay, DAY_MS],
    ["tpm", limit.tokensPerMinute, MINUTE_MS],
    ["itpm", limit.inputTokensPerMinute, MINUTE_MS],
  ] as [Kind, number | undefined, number][]) {
    if (cap === undefined || cap <= 0) continue;
    windows.set(windowKey(provider.id, model, kind), { count: cap, resetAt: until > now + span ? until : now + span });
  }
}

export function applyUpstreamRateLimitHeaders(provider: RateLimitProvider, model: string, headers: Headers): void {
  const remaining = headers.get("x-ratelimit-remaining-tokens");
  if (remaining !== null) {
    const parsed = Number.parseFloat(remaining);
    if (Number.isFinite(parsed) && parsed <= 0) {
      const reset = headers.get("x-ratelimit-reset-tokens");
      const seconds = reset ? Number.parseFloat(reset) : 0;
      noteRateLimitRejected(provider, model, Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : undefined);
    }
  }
}

export type RateLimitSnapshot = {
  providerId: string;
  model: string;
  rpm?: { used: number; limit: number };
  rpd?: { used: number; limit: number };
  tpm?: { used: number; limit: number };
  itpm?: { used: number; limit: number };
  exhausted: boolean;
};

export function rateLimitSnapshot(providerId: string, model: string): RateLimitSnapshot | null {
  const limit = rateLimitFor(providerId);
  if (!limit) return null;
  const now = Date.now();
  const pick = (kind: Kind, cap: number | undefined, span: number) =>
    cap === undefined || cap <= 0 ? undefined : { used: read(windowKey(providerId, model, kind), span, now).count, limit: cap };
  return {
    providerId,
    model,
    rpm: pick("rpm", limit.requestsPerMinute, MINUTE_MS),
    rpd: pick("rpd", limit.requestsPerDay, DAY_MS),
    tpm: pick("tpm", limit.tokensPerMinute, MINUTE_MS),
    itpm: pick("itpm", limit.inputTokensPerMinute, MINUTE_MS),
    exhausted: exhausted(providerId, model, now),
  };
}

export function resetRateLimits(): void {
  windows.clear();
}
