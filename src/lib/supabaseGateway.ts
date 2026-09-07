import { createHash } from "node:crypto";

export type SupabaseProvider = {
  id: string;
  baseUrl: string;
  format: string;
  apiKey: string;
  models: string[];
  priority: number;
};

export type SupabasePolicy = {
  id: string;
  keyHash: string;
  scopes: string[];
  allowedModels: string[];
  allowedEndpoints: string[];
  expiresAt?: string | null;
};
export type SupabaseModelOverride = { providerId: string; modelId: string; displayName?: string; capabilities: Record<string, unknown> };

type CacheEntry<T> = { value: T; expiresAt: number; version: string };
const CACHE_TTL_MS = Number(process.env.OMNIROUTE_CACHE_TTL_MS || 30_000);
const cache = new Map<string, CacheEntry<unknown>>();

function config() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  return url && key ? { url, key } : null;
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function jsonValue(value: unknown, fallback: any = []) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try { const parsed = JSON.parse(value); return parsed ?? fallback; } catch { return fallback; }
}

async function request(path: string, init: RequestInit = {}) {
  const c = config();
  if (!c) throw new Error("Supabase is not configured");
  const response = await fetch(`${c.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: c.key, authorization: `Bearer ${c.key}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text().catch(() => "")}`);
  return response;
}

// Supabase is an optimization, not a hard dependency. Any failure in a hot-path
// read (missing tables, unreachable project, bad credential) must degrade to the
// gateway's builtin/keyless fallback instead of crashing the whole request with
// an unhandled 500. Cache is cleared on failure so a later recovery is retried.
async function hot<T>(key: string, loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await cached(key, loader);
  } catch {
    cache.delete(key);
    return fallback;
  }
}

async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS, version: new Date().toISOString() });
  return value;
}

export function invalidateGatewayCache() { cache.clear(); }
export function hasSupabaseGateway() { return Boolean(config()); }

export type SupabaseHealth = { configured: boolean; reachable: boolean; tablesMissing: boolean; error?: string };
export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  const c = config();
  if (!c) return { configured: false, reachable: false, tablesMissing: false };
  try {
    const response = await fetch(`${c.url}/rest/v1/ai_provider_connections?select=id&limit=1`, {
      headers: { apikey: c.key, authorization: `Bearer ${c.key}`, "content-type": "application/json" },
    });
    if (response.ok) return { configured: true, reachable: true, tablesMissing: false };
    const text = await response.text().catch(() => "");
    if (response.status === 404 && text.includes("PGRST205")) return { configured: true, reachable: true, tablesMissing: true, error: text.slice(0, 200) };
    return { configured: true, reachable: false, tablesMissing: false, error: `Supabase ${response.status}: ${text.slice(0, 200)}` };
  } catch (error) {
    return { configured: true, reachable: false, tablesMissing: false, error: error instanceof Error ? error.message.slice(0, 200) : String(error) };
  }
}

export async function listHotProviders(): Promise<SupabaseProvider[]> {
  return hot("providers", async () => {
    const rows = await (await request("ai_provider_connections?enabled=eq.true&select=*&order=priority.asc,provider_id.asc")).json() as any[];
    return rows.map((row) => {
      const credentials = jsonValue(row.credentials_json, {});
      return { id: String(row.provider_id || row.id), baseUrl: String(row.base_url).replace(/\/+$/, ""), format: String(row.format || "openai"), apiKey: credentials.apiKey || credentials.api_key || "", models: jsonValue(row.models_json), priority: Number(row.priority || 0) };
    });
  }, []);
}

export async function listHotPolicies(): Promise<SupabasePolicy[]> {
  return hot("policies", async () => {
    const rows = await (await request("ai_api_key_policies?enabled=eq.true&select=*&order=created_at.asc")).json() as any[];
    return rows.map((row) => ({ id: String(row.id), keyHash: String(row.key_hash), scopes: jsonValue(row.scopes_json), allowedModels: jsonValue(row.allowed_models_json), allowedEndpoints: jsonValue(row.allowed_endpoints_json), expiresAt: row.expires_at }));
  }, []);
}

export async function listHotModelOverrides(): Promise<SupabaseModelOverride[]> {
  return hot("model-overrides", async () => {
    const rows = await (await request("ai_model_overrides?enabled=eq.true&select=*&order=provider_id.asc,model_id.asc")).json() as any[];
    return rows.map((row) => ({ providerId: String(row.provider_id), modelId: String(row.model_id), displayName: row.display_name || undefined, capabilities: jsonValue(row.capabilities_json, {}) }));
  }, []);
}

export function findHotPolicy(policies: SupabasePolicy[], supplied: string) {
  const keyHash = hash(supplied);
  return policies.find((policy) => policy.keyHash.length === keyHash.length && policy.keyHash === keyHash) || null;
}

export async function enqueueUsageEvent(event: { id: string; apiKeyId?: string | null; providerId: string; model: string; endpoint: string; status: string; inputTokens?: number | null; outputTokens?: number | null; latencyMs?: number | null }) {
  if (!hasSupabaseGateway()) return false;
  try {
    await request("ai_usage_queue", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ id: event.id, api_key_id: event.apiKeyId || null, provider_id: event.providerId, model: event.model, endpoint: event.endpoint, status: event.status, input_tokens: event.inputTokens ?? null, output_tokens: event.outputTokens ?? null, latency_ms: event.latencyMs ?? null }) });
    return true;
  } catch {
    return false;
  }
}

export type Reservation = { allowed: boolean; reason: "minute" | "daily" | null; retryAfterSeconds: number; dailyRequestCount: number; dailyRequestLimit: number };
export async function reserveHotProviderRequest(providerId: string, limits: { minimumIntervalMs: number; dailyRequestLimit: number }): Promise<Reservation> {
  try {
    const response = await request("rpc/reserve_provider_request", { method: "POST", body: JSON.stringify({ p_provider_id: providerId, p_minimum_interval_ms: limits.minimumIntervalMs, p_daily_request_limit: limits.dailyRequestLimit }) });
    const row = await response.json() as any;
    return Array.isArray(row) ? row[0] : row;
  } catch {
    // Supabase is down or the RPC is missing; do not block requests.
    return { allowed: true, reason: null, retryAfterSeconds: 0, dailyRequestCount: 0, dailyRequestLimit: limits.dailyRequestLimit } as Reservation;
  }
}

export async function claimUsageBatch(limit = 250, leaseSeconds = 300) {
  try {
    const response = await request("rpc/claim_usage_batch", { method: "POST", body: JSON.stringify({ p_limit: limit, p_lease_seconds: leaseSeconds }) });
    return await response.json() as any[];
  } catch {
    return [];
  }
}

export async function completeUsageBatch(ids: string[], batchId: string, error?: string) {
  try {
    await request("rpc/complete_usage_batch", { method: "POST", body: JSON.stringify({ p_ids: ids, p_batch_id: batchId, p_error: error || null }) });
  } catch {
    // Best-effort; the worker can retry on the next tick.
  }
}

export { hash as hashGatewayKey };
