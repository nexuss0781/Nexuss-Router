import type { ParadRequestDependencies, ParadRequestContext } from "@/lib/vercel-parad/index.ts";
import { withParadRead, withParadWrite } from "@/lib/vercel-parad/index.ts";

export type ProviderConnectionRecord = {
  id: string;
  providerId: string;
  label?: string;
  baseUrl: string;
  format: string;
  credentials: Record<string, unknown>;
  providerData?: Record<string, unknown>;
  models: string[];
  enabled?: boolean;
  priority?: number;
  updatedAt?: string;
};

export type AiApiKeyPolicy = {
  id: string;
  keyHash: string;
  name?: string;
  scopes: string[];
  allowedModels: string[];
  allowedEndpoints: string[];
  enabled?: boolean;
  expiresAt?: string | null;
  budgetCents?: number | null;
  tokenLimit?: number | null;
  createdAt?: string;
};

export type AiComboRecord = {
  id: string;
  name: string;
  targets: Array<{ providerId: string; model: string; weight?: number }>;
  enabled?: boolean;
  updatedAt?: string;
};

export type AiModelOverride = {
  providerId: string;
  modelId: string;
  displayName?: string;
  capabilities: Record<string, unknown>;
  enabled?: boolean;
  updatedAt?: string;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS ai_provider_connections (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    label TEXT,
    base_url TEXT NOT NULL,
    format TEXT NOT NULL,
    credentials_json TEXT NOT NULL DEFAULT '{}',
    provider_data_json TEXT NOT NULL DEFAULT '{}',
    models_json TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_provider_connections_enabled_priority ON ai_provider_connections(enabled, priority, provider_id)`,
  `CREATE TABLE IF NOT EXISTS ai_api_key_policies (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT,
    scopes_json TEXT NOT NULL DEFAULT '[]',
    allowed_models_json TEXT NOT NULL DEFAULT '[]',
    allowed_endpoints_json TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    budget_cents INTEGER,
    token_limit INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_combos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    targets_json TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_model_overrides (
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT,
    capabilities_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(provider_id, model_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ai_usage_events (
    id TEXT PRIMARY KEY,
    api_key_id TEXT,
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created_at ON ai_usage_events(created_at)`,
  `CREATE TABLE IF NOT EXISTS ai_provider_request_limits (
    provider_id TEXT PRIMARY KEY,
    last_request_at TEXT,
    daily_window TEXT NOT NULL,
    daily_request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_jobs (
    id TEXT PRIMARY KEY,
    api_key_id TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    request_json TEXT NOT NULL,
    result_json TEXT,
    error_json TEXT,
    callback_url TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL,
    cancel_requested INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_available ON ai_jobs(status, available_at, created_at)`,
  `CREATE TABLE IF NOT EXISTS ai_files (
    id TEXT PRIMARY KEY,
    api_key_id TEXT,
    bytes INTEGER NOT NULL,
    filename TEXT NOT NULL,
    purpose TEXT NOT NULL,
    mime_type TEXT,
    content_blob BLOB NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_files_api_key_created ON ai_files(api_key_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ai_idempotency_keys (
    key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    response_json TEXT,
    status TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

export function ensureAiGatewaySchema(context: Pick<ParadRequestContext, "db">): void {
  for (const sql of schemaStatements) context.db.execute(sql);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function providerFromRow(row: any): ProviderConnectionRecord {
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    label: typeof row.label === "string" ? row.label : undefined,
    baseUrl: String(row.base_url),
    format: String(row.format),
    credentials: parseJson(row.credentials_json, {}),
    providerData: parseJson(row.provider_data_json, {}),
    models: parseJson(row.models_json, []),
    enabled: Boolean(row.enabled),
    priority: Number(row.priority || 0),
    updatedAt: String(row.updated_at),
  };
}

function apiKeyFromRow(row: any): AiApiKeyPolicy {
  return {
    id: String(row.id),
    keyHash: String(row.key_hash),
    name: typeof row.name === "string" ? row.name : undefined,
    scopes: parseJson(row.scopes_json, []),
    allowedModels: parseJson(row.allowed_models_json, []),
    allowedEndpoints: parseJson(row.allowed_endpoints_json, []),
    enabled: Boolean(row.enabled),
    expiresAt: row.expires_at ?? null,
    budgetCents: row.budget_cents == null ? null : Number(row.budget_cents),
    tokenLimit: row.token_limit == null ? null : Number(row.token_limit),
    createdAt: String(row.created_at),
  };
}

export async function listProviderConnections(dependencies: ParadRequestDependencies = {}): Promise<ProviderConnectionRecord[]> {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    return context.db.execute(
      `SELECT id, provider_id, label, base_url, format, credentials_json, provider_data_json, models_json, enabled, priority, updated_at
       FROM ai_provider_connections WHERE enabled = 1 ORDER BY priority ASC, provider_id ASC, id ASC`,
    ).rows.map(providerFromRow);
  }, dependencies);
}

export async function listApiKeyPolicies(dependencies: ParadRequestDependencies = {}): Promise<AiApiKeyPolicy[]> {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    return context.db.execute(
      `SELECT id, key_hash, name, scopes_json, allowed_models_json, allowed_endpoints_json, enabled, expires_at, budget_cents, token_limit, created_at
       FROM ai_api_key_policies WHERE enabled = 1 ORDER BY created_at ASC`,
    ).rows.map(apiKeyFromRow);
  }, dependencies);
}

export async function upsertProviderConnection(
  record: ProviderConnectionRecord,
  dependencies: ParadRequestDependencies = {},
) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    context.db.execute(
      `INSERT INTO ai_provider_connections
       (id, provider_id, label, base_url, format, credentials_json, provider_data_json, models_json, enabled, priority, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET provider_id=excluded.provider_id, label=excluded.label, base_url=excluded.base_url,
       format=excluded.format, credentials_json=excluded.credentials_json, provider_data_json=excluded.provider_data_json,
       models_json=excluded.models_json, enabled=excluded.enabled, priority=excluded.priority, updated_at=excluded.updated_at`,
      [
        record.id,
        record.providerId,
        record.label ?? null,
        record.baseUrl,
        record.format,
        JSON.stringify(record.credentials ?? {}),
        JSON.stringify(record.providerData ?? {}),
        JSON.stringify(record.models ?? []),
        record.enabled === false ? 0 : 1,
        record.priority ?? 0,
        record.updatedAt ?? new Date().toISOString(),
      ],
    );
    return record.id;
  }, { dependencies });
}

export async function listCombos(dependencies: ParadRequestDependencies = {}): Promise<AiComboRecord[]> {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    return context.db.execute(
      `SELECT id, name, targets_json, enabled, updated_at FROM ai_combos WHERE enabled = 1 ORDER BY name ASC`,
    ).rows.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      targets: parseJson(row.targets_json, []),
      enabled: Boolean(row.enabled),
      updatedAt: String(row.updated_at),
    }));
  }, dependencies);
}

export async function upsertCombo(record: AiComboRecord, dependencies: ParadRequestDependencies = {}) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    context.db.execute(
      `INSERT INTO ai_combos (id, name, targets_json, enabled, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, targets_json=excluded.targets_json, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [record.id, record.name, JSON.stringify(record.targets ?? []), record.enabled === false ? 0 : 1, record.updatedAt ?? new Date().toISOString()],
    );
    return record.id;
  }, { dependencies });
}

export async function listModelOverrides(dependencies: ParadRequestDependencies = {}): Promise<AiModelOverride[]> {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    return context.db.execute(
      `SELECT provider_id, model_id, display_name, capabilities_json, enabled, updated_at
       FROM ai_model_overrides WHERE enabled = 1 ORDER BY provider_id ASC, model_id ASC`,
    ).rows.map((row: any) => ({
      providerId: String(row.provider_id),
      modelId: String(row.model_id),
      displayName: typeof row.display_name === "string" ? row.display_name : undefined,
      capabilities: parseJson(row.capabilities_json, {}),
      enabled: Boolean(row.enabled),
      updatedAt: String(row.updated_at),
    }));
  }, dependencies);
}

export async function upsertModelOverride(record: AiModelOverride, dependencies: ParadRequestDependencies = {}) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    context.db.execute(
      `INSERT INTO ai_model_overrides (provider_id, model_id, display_name, capabilities_json, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider_id, model_id) DO UPDATE SET display_name=excluded.display_name, capabilities_json=excluded.capabilities_json, enabled=excluded.enabled, updated_at=excluded.updated_at`,
      [record.providerId, record.modelId, record.displayName ?? null, JSON.stringify(record.capabilities ?? {}), record.enabled === false ? 0 : 1, record.updatedAt ?? new Date().toISOString()],
    );
    return `${record.providerId}/${record.modelId}`;
  }, { dependencies });
}

export async function upsertApiKeyPolicy(
  policy: AiApiKeyPolicy,
  dependencies: ParadRequestDependencies = {},
) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    context.db.execute(
      `INSERT INTO ai_api_key_policies
       (id, key_hash, name, scopes_json, allowed_models_json, allowed_endpoints_json, enabled, expires_at, budget_cents, token_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET key_hash=excluded.key_hash, name=excluded.name, scopes_json=excluded.scopes_json,
       allowed_models_json=excluded.allowed_models_json, allowed_endpoints_json=excluded.allowed_endpoints_json,
       enabled=excluded.enabled, expires_at=excluded.expires_at, budget_cents=excluded.budget_cents, token_limit=excluded.token_limit`,
      [
        policy.id,
        policy.keyHash,
        policy.name ?? null,
        JSON.stringify(policy.scopes ?? []),
        JSON.stringify(policy.allowedModels ?? []),
        JSON.stringify(policy.allowedEndpoints ?? []),
        policy.enabled === false ? 0 : 1,
        policy.expiresAt ?? null,
        policy.budgetCents ?? null,
        policy.tokenLimit ?? null,
        policy.createdAt ?? new Date().toISOString(),
      ],
    );
    return policy.id;
  }, { dependencies });
}

export type AiJobRecord = {
  id: string;
  apiKeyId?: string | null;
  kind: string;
  status: string;
  request: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  callbackUrl?: string | null;
  attempts: number;
  availableAt: string;
  cancelRequested: boolean;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

function jobFromRow(row: any): AiJobRecord {
  return { id: String(row.id), apiKeyId: row.api_key_id ?? null, kind: String(row.kind), status: String(row.status), request: parseJson(row.request_json, {}), result: parseJson(row.result_json, undefined), error: parseJson(row.error_json, undefined), callbackUrl: row.callback_url ?? null, attempts: Number(row.attempts || 0), availableAt: String(row.available_at), cancelRequested: Boolean(row.cancel_requested), createdAt: String(row.created_at), startedAt: row.started_at ?? null, finishedAt: row.finished_at ?? null };
}

export async function createAiJob(job: Pick<AiJobRecord, "id" | "apiKeyId" | "kind" | "request" | "callbackUrl">, dependencies: ParadRequestDependencies = {}) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    const now = new Date().toISOString();
    context.db.execute(
      `INSERT INTO ai_jobs (id, api_key_id, kind, status, request_json, callback_url, attempts, available_at, cancel_requested, created_at)
       VALUES (?, ?, ?, 'queued', ?, ?, 0, ?, 0, ?)`,
      [job.id, job.apiKeyId ?? null, job.kind, JSON.stringify(job.request ?? {}), job.callbackUrl ?? null, now, now],
    );
    return job.id;
  }, { dependencies });
}

export async function getAiJob(id: string, apiKeyId: string | null | undefined, dependencies: ParadRequestDependencies = {}) {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    const rows = context.db.execute(`SELECT * FROM ai_jobs WHERE id = ? AND (? IS NULL OR api_key_id = ?) LIMIT 1`, [id, apiKeyId ?? null, apiKeyId ?? null]).rows;
    return rows[0] ? jobFromRow(rows[0]) : null;
  }, dependencies);
}

export async function listAiJobs(apiKeyId: string | null | undefined, limit = 100, dependencies: ParadRequestDependencies = {}) {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    return context.db.execute(`SELECT * FROM ai_jobs WHERE (? IS NULL OR api_key_id = ?) ORDER BY created_at DESC LIMIT ?`, [apiKeyId ?? null, apiKeyId ?? null, Math.min(Math.max(limit, 1), 100)]).rows.map(jobFromRow);
  }, dependencies);
}

export async function updateAiJob(id: string, apiKeyId: string | null | undefined, update: Partial<Pick<AiJobRecord, "status" | "result" | "error" | "callbackUrl" | "attempts" | "availableAt" | "cancelRequested" | "startedAt" | "finishedAt">>, dependencies: ParadRequestDependencies = {}) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    const currentRows = context.db.execute(`SELECT * FROM ai_jobs WHERE id = ? AND (? IS NULL OR api_key_id = ?) LIMIT 1`, [id, apiKeyId ?? null, apiKeyId ?? null]).rows;
    if (!currentRows[0]) return false;
    const current = jobFromRow(currentRows[0]);
    const next = { ...current, ...update };
    context.db.execute(`UPDATE ai_jobs SET status=?, result_json=?, error_json=?, callback_url=?, attempts=?, available_at=?, cancel_requested=?, started_at=?, finished_at=? WHERE id=?`, [next.status, next.result === undefined ? null : JSON.stringify(next.result), next.error === undefined ? null : JSON.stringify(next.error), next.callbackUrl ?? null, next.attempts, next.availableAt, next.cancelRequested ? 1 : 0, next.startedAt ?? null, next.finishedAt ?? null, id]);
    return true;
  }, { dependencies });
}

export async function createAiFile(
  file: { id: string; apiKeyId?: string | null; bytes: number; filename: string; purpose: string; mimeType?: string | null; content: Uint8Array; expiresAt?: string | null },
  dependencies: ParadRequestDependencies = {},
) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    context.db.execute(
      `INSERT INTO ai_files (id, api_key_id, bytes, filename, purpose, mime_type, content_blob, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [file.id, file.apiKeyId ?? null, file.bytes, file.filename, file.purpose, file.mimeType ?? null, file.content, file.expiresAt ?? null, new Date().toISOString()],
    );
    return file.id;
  }, { dependencies });
}

export async function listAiFiles(apiKeyId: string | null | undefined, dependencies: ParadRequestDependencies = {}) {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    const rows = context.db.execute(
      `SELECT id, api_key_id, bytes, filename, purpose, mime_type, expires_at, created_at FROM ai_files
       WHERE (? IS NULL OR api_key_id = ?) AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC`,
      [apiKeyId ?? null, apiKeyId ?? null, new Date().toISOString()],
    ).rows;
    return rows.map((row: any) => ({ id: String(row.id), apiKeyId: row.api_key_id ?? null, bytes: Number(row.bytes), filename: String(row.filename), purpose: String(row.purpose), mimeType: row.mime_type ?? null, expiresAt: row.expires_at ?? null, createdAt: String(row.created_at) }));
  }, dependencies);
}

export async function getAiFile(id: string, apiKeyId: string | null | undefined, dependencies: ParadRequestDependencies = {}) {
  return withParadRead((context) => {
    ensureAiGatewaySchema(context);
    const rows = context.db.execute(
      `SELECT id, api_key_id, bytes, filename, purpose, mime_type, content_blob, expires_at, created_at FROM ai_files
       WHERE id = ? AND (? IS NULL OR api_key_id = ?) LIMIT 1`,
      [id, apiKeyId ?? null, apiKeyId ?? null],
    ).rows;
    const row: any = rows[0];
    if (!row) return null;
    return { id: String(row.id), apiKeyId: row.api_key_id ?? null, bytes: Number(row.bytes), filename: String(row.filename), purpose: String(row.purpose), mimeType: row.mime_type ?? null, content: row.content_blob instanceof Uint8Array ? row.content_blob : new Uint8Array(row.content_blob || []), expiresAt: row.expires_at ?? null, createdAt: String(row.created_at) };
  }, dependencies);
}

export async function deleteAiFile(id: string, apiKeyId: string | null | undefined, dependencies: ParadRequestDependencies = {}) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    const result = context.db.execute(`DELETE FROM ai_files WHERE id = ? AND (? IS NULL OR api_key_id = ?)`, [id, apiKeyId ?? null, apiKeyId ?? null]);
    return Number(result.changes || 0) > 0;
  }, { dependencies });
}

export async function recordAiUsageEvent(
  event: {
    id: string;
    apiKeyId?: string | null;
    providerId: string;
    model: string;
    endpoint: string;
    status: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    latencyMs?: number | null;
  },
  dependencies: ParadRequestDependencies = {},
) {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    context.db.execute(
      `INSERT INTO ai_usage_events (id, api_key_id, provider_id, model, endpoint, status, input_tokens, output_tokens, latency_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.apiKeyId ?? null, event.providerId, event.model, event.endpoint, event.status, event.inputTokens ?? null, event.outputTokens ?? null, event.latencyMs ?? null, new Date().toISOString()],
    );
    return event.id;
  }, { dependencies });
}

export type ProviderRequestReservation = {
  allowed: boolean;
  reason: "minute" | "daily" | null;
  retryAfterSeconds: number;
  dailyRequestCount: number;
  dailyRequestLimit: number;
};

export async function reserveProviderRequest(
  providerId: string,
  limits: { minimumIntervalMs: number; dailyRequestLimit: number },
  dependencies: ParadRequestDependencies = {},
): Promise<ProviderRequestReservation> {
  return withParadWrite((context) => {
    ensureAiGatewaySchema(context);
    const now = new Date();
    const nowIso = now.toISOString();
    const utcDay = nowIso.slice(0, 10);
    const row = context.db.execute(
      `SELECT last_request_at, daily_window, daily_request_count FROM ai_provider_request_limits WHERE provider_id = ? LIMIT 1`,
      [providerId],
    ).rows[0] as { last_request_at?: string | null; daily_window?: string | null; daily_request_count?: number | null } | undefined;
    const dailyRequestCount = row?.daily_window === utcDay ? Number(row.daily_request_count || 0) : 0;
    const lastRequestAt = row?.last_request_at ? Date.parse(row.last_request_at) : Number.NaN;
    const elapsedMs = Number.isFinite(lastRequestAt) ? now.getTime() - lastRequestAt : Number.POSITIVE_INFINITY;
    if (elapsedMs < limits.minimumIntervalMs) {
      return {
        allowed: false,
        reason: "minute",
        retryAfterSeconds: Math.max(1, Math.ceil((limits.minimumIntervalMs - elapsedMs) / 1_000)),
        dailyRequestCount,
        dailyRequestLimit: limits.dailyRequestLimit,
      } satisfies ProviderRequestReservation;
    }
    if (dailyRequestCount >= limits.dailyRequestLimit) {
      const nextUtcDay = new Date(`${utcDay}T00:00:00.000Z`);
      nextUtcDay.setUTCDate(nextUtcDay.getUTCDate() + 1);
      return {
        allowed: false,
        reason: "daily",
        retryAfterSeconds: Math.max(1, Math.ceil((nextUtcDay.getTime() - now.getTime()) / 1_000)),
        dailyRequestCount,
        dailyRequestLimit: limits.dailyRequestLimit,
      } satisfies ProviderRequestReservation;
    }
    const nextCount = dailyRequestCount + 1;
    context.db.execute(
      `INSERT INTO ai_provider_request_limits (provider_id, last_request_at, daily_window, daily_request_count, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET last_request_at=excluded.last_request_at, daily_window=excluded.daily_window,
       daily_request_count=excluded.daily_request_count, updated_at=excluded.updated_at`,
      [providerId, nowIso, utcDay, nextCount, nowIso],
    );
    return {
      allowed: true,
      reason: null,
      retryAfterSeconds: 0,
      dailyRequestCount: nextCount,
      dailyRequestLimit: limits.dailyRequestLimit,
    } satisfies ProviderRequestReservation;
  }, { dependencies, maxRetries: 4 }).then((result) => result.value);
}
