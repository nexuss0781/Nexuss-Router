export type RateLimitProvider = { id: string; baseUrl: string };

export type RateLimit = {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  inputTokensPerMinute?: number;
  outputTokensPerMinute?: number;
  source?: string;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// Existing provider limits are keyed per routed model. Keep that behavior for
// providers whose published budgets are per-model or whose limits are measured.
export const PROVIDER_RATE_LIMITS: Record<string, RateLimit> = {
  "kilo-gateway": {},
  groq: { requestsPerMinute: 1000, tokensPerMinute: 8000, inputTokensPerMinute: 7000, source: "measured" },
  openrouter: { requestsPerMinute: 20, requestsPerDay: 50, source: "measured" },
  // NVIDIA's trial tier throttles per model with no published limit, no rate-limit
  // headers, and no quota endpoint, so the ceiling is measured. A single provider-level
  // row is the correct shape here: every registered model was measured at the same
  // ~15-20 req/min, and each model carries an independent budget, so a shared row never
  // understates a model's own allowance. Sits below the observed ceiling on purpose.
  nvidia: { requestsPerMinute: 15, source: "measured" },
  // Published at docs.puter.com/rate-limits-and-quotas: free tier is 30 requests per 10s
  // per interface+method, with 3 concurrent. Measured on this account: 25 simultaneous
  // calls all passed, 30 at once started failing, and 40 at once gave 10 ok / 30 x 429, so
  // concurrency is the real ceiling and is enforced in puter.ts. 30 per 10s is 180 rpm;
  // held to 120 because the window is shared by every registered model.
  puter: { requestsPerMinute: 120, source: "published-free-tier" },
};

// These provider quotas are account-wide and therefore use one shared counter across
// every model. Values are the absolute-free account tier only; no paid-tier allowance
// is included. Per-model caps below are additional ceilings, not substitutes for these.
export const PROVIDER_ACCOUNT_RATE_LIMITS: Record<string, RateLimit> = {
  tokenharbor: { requestsPerMinute: 60, requestsPerHour: 1800, source: "published-free-account" },
  orcarouter: { requestsPerMinute: 10, requestsPerDay: 50, source: "published-absolute-free-account" },
};

// OrcaRouter publishes additional caps for these free-package models. The account cap
// still applies as well, so the effective allowance is whichever applicable budget is
// reached first.
export const PROVIDER_MODEL_RATE_LIMITS: Record<string, Record<string, RateLimit>> = {
  mistral: {
    "ministral-3b-latest": { requestsPerMinute: 750, tokensPerMinute: 1_300_000, source: "measured" },
    "ministral-8b-latest": { requestsPerMinute: 188, tokensPerMinute: 625_000, source: "measured" },
    "ministral-14b-latest": { requestsPerMinute: 30, tokensPerMinute: 937_500, source: "measured" },
    "codestral-latest": { requestsPerMinute: 125, tokensPerMinute: 625_000, source: "measured" },
  },
  orcarouter: {
    "tencent/hy4-preview-free": { requestsPerMinute: 50, requestsPerDay: 250, source: "published-free-model" },
    "orca/orcaverify-text1.0-free": { requestsPerMinute: 5, requestsPerDay: 50, source: "published-free-model" },
  },
};

type Window = { count: number; resetAt: number };
type Kind = "rpm" | "rph" | "rpd" | "tpm" | "itpm" | "otpm";
type Scope = "account" | "model";
type LimitRule = { scope: Scope; limit: RateLimit };
type DynamicRateLimits = {
  providers: Record<string, RateLimit>;
  models: Record<string, Record<string, RateLimit>>;
};

const LIMIT_FIELDS = [
  "requestsPerMinute",
  "requestsPerHour",
  "requestsPerDay",
  "tokensPerMinute",
  "inputTokensPerMinute",
  "outputTokensPerMinute",
] as const;
const windows = new Map<string, Window>();
let cachedConfigRaw: string | null = null;
let cachedConfig: DynamicRateLimits = { providers: {}, models: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLimit(value: unknown): RateLimit | null {
  if (!isRecord(value)) return null;
  const result: RateLimit = {};
  for (const field of LIMIT_FIELDS) {
    const raw = value[field];
    if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) result[field] = raw;
  }
  return Object.keys(result).length ? result : null;
}

function enforceFreeTierCeiling(providerId: string, modelId: string | null, limit: RateLimit): RateLimit | null {
  const normalized = modelId === null ? null : normalizedModelId(providerId, modelId);
  const ceiling = normalized === null
    ? PROVIDER_ACCOUNT_RATE_LIMITS[providerId]
    : PROVIDER_MODEL_RATE_LIMITS[providerId]?.[normalized] ?? PROVIDER_ACCOUNT_RATE_LIMITS[providerId];
  if (!ceiling) return limit;
  const safe: RateLimit = {};
  for (const field of LIMIT_FIELDS) {
    const value = limit[field];
    if (value === undefined) continue;
    if (PROVIDER_ACCOUNT_RATE_LIMITS[providerId] && value === 0) continue;
    const maximum = ceiling[field];
    if (maximum === undefined || value <= maximum) safe[field] = value;
  }
  return Object.keys(safe).length ? safe : null;
}

function parseDynamicRateLimits(raw: string): DynamicRateLimits {
  if (!raw.trim()) return { providers: {}, models: {} };
  try {
    const root: unknown = JSON.parse(raw);
    if (!isRecord(root)) return { providers: {}, models: {} };
    const providers: Record<string, RateLimit> = {};
    const models: Record<string, Record<string, RateLimit>> = {};

    if (isRecord(root.providers)) {
      for (const [providerId, value] of Object.entries(root.providers)) {
        const limit = parseLimit(value);
        const safeLimit = limit ? enforceFreeTierCeiling(providerId, null, limit) : null;
        if (safeLimit) providers[providerId] = safeLimit;
      }
    }
    if (isRecord(root.models)) {
      for (const [providerId, value] of Object.entries(root.models)) {
        if (!isRecord(value)) continue;
        const providerModels: Record<string, RateLimit> = {};
        for (const [modelId, modelValue] of Object.entries(value)) {
          const limit = parseLimit(modelValue);
          const safeLimit = limit ? enforceFreeTierCeiling(providerId, modelId, limit) : null;
          if (safeLimit) providerModels[modelId] = safeLimit;
        }
        if (Object.keys(providerModels).length) models[providerId] = providerModels;
      }
    }
    return { providers, models };
  } catch {
    // A malformed optional override must not take down the gateway; defaults remain active.
    return { providers: {}, models: {} };
  }
}

function dynamicRateLimits(): DynamicRateLimits {
  const raw = process.env.OMNIROUTE_RATE_LIMITS_JSON ?? "";
  if (raw !== cachedConfigRaw) {
    cachedConfigRaw = raw;
    cachedConfig = parseDynamicRateLimits(raw);
  }
  return cachedConfig;
}

function mergeLimits(...limits: Array<RateLimit | undefined>): RateLimit | null {
  const result: RateLimit = {};
  let hasValue = false;
  for (const limit of limits) {
    if (!limit) continue;
    for (const field of LIMIT_FIELDS) {
      if (limit[field] !== undefined) {
        result[field] = limit[field];
        hasValue = true;
      }
    }
    if (limit.source) result.source = limit.source;
  }
  return hasValue ? result : null;
}

function normalizedModelId(providerId: string, model: string): string {
  return model.startsWith(`${providerId}/`) ? model.slice(providerId.length + 1) : model;
}

function routeLimitFor(providerId: string, model: string): RateLimit | null {
  const normalized = normalizedModelId(providerId, model);
  const configuredModelLimit = dynamicRateLimits().models[providerId]?.[normalized]
    ?? dynamicRateLimits().models[providerId]?.[model];
  const builtInModelLimit = PROVIDER_MODEL_RATE_LIMITS[providerId]?.[normalized];
  // Keep historical model-over-provider precedence, then let a JSON model override
  // tune only the fields it names while preserving the rest of that model's defaults.
  const base = builtInModelLimit ?? PROVIDER_RATE_LIMITS[providerId];
  return mergeLimits(base, configuredModelLimit);
}

function accountLimitFor(providerId: string): RateLimit | null {
  return mergeLimits(PROVIDER_ACCOUNT_RATE_LIMITS[providerId], dynamicRateLimits().providers[providerId]);
}

function rulesFor(providerId: string, model: string): LimitRule[] {
  const rules: LimitRule[] = [];
  const accountLimit = accountLimitFor(providerId);
  const modelLimit = routeLimitFor(providerId, model);
  if (accountLimit) rules.push({ scope: "account", limit: accountLimit });
  if (modelLimit) rules.push({ scope: "model", limit: modelLimit });
  return rules;
}

function utcDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

function windowKey(providerId: string, model: string, kind: Kind, scope: Scope): string {
  return `${providerId}|${scope === "account" ? "*" : normalizedModelId(providerId, model)}|${kind}`;
}

function read(key: string, span: number, now: number): Window {
  const current = windows.get(key);
  if (current && current.resetAt > now) return current;
  const fresh: Window = { count: 0, resetAt: span === DAY_MS ? utcDayStart(now) + DAY_MS : now + span };
  windows.set(key, fresh);
  return fresh;
}

// Returns the model/route budget for compatibility, falling back to the account
// budget when a provider has no model-scoped limit.
export function rateLimitFor(providerId: string, model = ""): RateLimit | null {
  return routeLimitFor(providerId, model) ?? accountLimitFor(providerId);
}

function checksFor(limit: RateLimit): Array<[Kind, number | undefined, number]> {
  return [
    ["rpm", limit.requestsPerMinute, MINUTE_MS],
    ["rph", limit.requestsPerHour, HOUR_MS],
    ["rpd", limit.requestsPerDay, DAY_MS],
    ["tpm", limit.tokensPerMinute, MINUTE_MS],
    ["itpm", limit.inputTokensPerMinute, MINUTE_MS],
    ["otpm", limit.outputTokensPerMinute, MINUTE_MS],
  ];
}

function exhausted(providerId: string, model: string, now = Date.now()): boolean {
  for (const rule of rulesFor(providerId, model)) {
    for (const [kind, cap, span] of checksFor(rule.limit)) {
      if (cap === undefined || cap <= 0) continue;
      if (read(windowKey(providerId, model, kind, rule.scope), span, now).count >= cap) return true;
    }
  }
  return false;
}

export function isRateLimitExhausted(provider: RateLimitProvider, model: string): boolean {
  return exhausted(provider.id, model);
}

// Reserve request budget synchronously before issuing an upstream request. This
// counts attempts (including errors) and prevents concurrent requests in one runtime
// from all passing the same local preflight check before any counter is incremented.
export function reserveRateLimitRequest(provider: RateLimitProvider, model: string): void {
  const now = Date.now();
  for (const rule of rulesFor(provider.id, model)) {
    if (rule.limit.requestsPerMinute) read(windowKey(provider.id, model, "rpm", rule.scope), MINUTE_MS, now).count += 1;
    if (rule.limit.requestsPerHour) read(windowKey(provider.id, model, "rph", rule.scope), HOUR_MS, now).count += 1;
    if (rule.limit.requestsPerDay) read(windowKey(provider.id, model, "rpd", rule.scope), DAY_MS, now).count += 1;
  }
}

export function consumeRateLimit(provider: RateLimitProvider, model: string, usage: { inputTokens?: number; outputTokens?: number } = {}): void {
  const now = Date.now();
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  for (const rule of rulesFor(provider.id, model)) {
    if (rule.limit.tokensPerMinute) read(windowKey(provider.id, model, "tpm", rule.scope), MINUTE_MS, now).count += input + output;
    if (rule.limit.inputTokensPerMinute) read(windowKey(provider.id, model, "itpm", rule.scope), MINUTE_MS, now).count += input;
    if (rule.limit.outputTokensPerMinute) read(windowKey(provider.id, model, "otpm", rule.scope), MINUTE_MS, now).count += output;
  }
}

export function noteRateLimitRejected(provider: RateLimitProvider, model: string, resetAtMs?: number): void {
  const now = Date.now();
  for (const rule of rulesFor(provider.id, model)) {
    for (const [kind, cap, span] of checksFor(rule.limit)) {
      if (cap === undefined || cap <= 0) continue;
      const reset = resetAtMs && resetAtMs > now ? resetAtMs : now;
      const until = Math.max(reset, now + span);
      windows.set(windowKey(provider.id, model, kind, rule.scope), { count: cap, resetAt: until });
    }
  }
}

export function applyUpstreamRateLimitHeaders(provider: RateLimitProvider, model: string, headers: Headers): void {
  // Groq publishes one remaining-token counter plus a reset hint. Mistral publishes
  // full request and token budgets but no reset hint, so an exhausted Mistral model
  // takes the conservative one-minute hold. Either family reaching zero means this
  // model is done for the window, which is far tighter than waiting out a guessed
  // ceiling after the fact.
  const groqTokens = Number.parseFloat(headers.get("x-ratelimit-remaining-tokens") ?? "");
  if (Number.isFinite(groqTokens) && groqTokens <= 0) {
    const reset = headers.get("x-ratelimit-reset-tokens");
    const seconds = reset ? Number.parseFloat(reset) : 0;
    noteRateLimitRejected(provider, model, Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : undefined);
    return;
  }
  const mistralRequests = Number.parseFloat(headers.get("x-ratelimit-remaining-req-minute") ?? "");
  const mistralTokens = Number.parseFloat(headers.get("x-ratelimit-remaining-tokens-minute") ?? "");
  if ((Number.isFinite(mistralRequests) && mistralRequests <= 0) || (Number.isFinite(mistralTokens) && mistralTokens <= 0)) {
    noteRateLimitRejected(provider, model);
  }
}

export type RateLimitMetrics = {
  rpm?: { used: number; limit: number };
  rph?: { used: number; limit: number };
  rpd?: { used: number; limit: number };
  tpm?: { used: number; limit: number };
  itpm?: { used: number; limit: number };
  otpm?: { used: number; limit: number };
};

export type RateLimitSnapshot = RateLimitMetrics & {
  providerId: string;
  model: string;
  scope: Scope;
  account?: RateLimitMetrics;
  modelLimit?: RateLimitMetrics;
  exhausted: boolean;
};

function metricsFor(providerId: string, model: string, scope: Scope, limit: RateLimit): RateLimitMetrics {
  const now = Date.now();
  const pick = (kind: Kind, cap: number | undefined, span: number) =>
    cap === undefined || cap <= 0 ? undefined : { used: read(windowKey(providerId, model, kind, scope), span, now).count, limit: cap };
  return {
    rpm: pick("rpm", limit.requestsPerMinute, MINUTE_MS),
    rph: pick("rph", limit.requestsPerHour, HOUR_MS),
    rpd: pick("rpd", limit.requestsPerDay, DAY_MS),
    tpm: pick("tpm", limit.tokensPerMinute, MINUTE_MS),
    itpm: pick("itpm", limit.inputTokensPerMinute, MINUTE_MS),
    otpm: pick("otpm", limit.outputTokensPerMinute, MINUTE_MS),
  };
}

export function rateLimitSnapshot(providerId: string, model: string): RateLimitSnapshot | null {
  const rules = rulesFor(providerId, model);
  if (!rules.length) return null;
  const accountRule = rules.find((rule) => rule.scope === "account");
  const modelRule = rules.find((rule) => rule.scope === "model");
  const primary = modelRule ?? accountRule!;
  return {
    ...metricsFor(providerId, model, primary.scope, primary.limit),
    providerId,
    model,
    scope: primary.scope,
    ...(accountRule ? { account: metricsFor(providerId, model, "account", accountRule.limit) } : {}),
    ...(modelRule ? { modelLimit: metricsFor(providerId, model, "model", modelRule.limit) } : {}),
    exhausted: exhausted(providerId, model),
  };
}

export function resetRateLimits(): void {
  windows.clear();
}
