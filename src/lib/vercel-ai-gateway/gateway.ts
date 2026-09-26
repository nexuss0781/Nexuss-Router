import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { ParadRequestDependencies } from "@/lib/vercel-parad/index.ts";
import { getAiModelMetadata } from "./modelMetadata";
import { GROQ_BASE_URL, GROQ_MODELS, GROQ_PROVIDER_ID, latestUserText, promptGuardEnabled, screenPrompt, supportsNativeToolCalls, withMaxTokensFloor } from "./groq";
import {
  listApiKeyPolicies,
  listProviderConnections,
  listModelOverrides,
  createAiFile,
  listAiFiles,
  getAiFile,
  deleteAiFile,
  createAiJob,
  getAiJob,
  listAiJobs,
  updateAiJob,
  recordAiUsageEvent,
  type AiApiKeyPolicy,
  type ProviderConnectionRecord,
} from "./repositories.ts";
import {
  checkSupabaseHealth,
  findHotPolicy,
  getHotUsageHealth,
  hasSupabaseGateway,
  listHotPolicies,
  listHotModelOverrides,
  listHotProviders,
  enqueueUsageEvent,
  type UsageHealthRow,
} from "@/lib/supabaseGateway";
import { applySupabaseMigration, SCHEMA_VERSION } from "@/lib/supabaseMigration";
import {
  canonicalizeToolCallStream,
  decodeToolAffinity,
  encodeToolAffinity,
  normalizeChatToolRequest,
  normalizeChatToolResponse,
  OMNIROUTE_TOOL_AFFINITY_HEADER,
  OMNIROUTE_TOOL_PROTOCOL,
  type NormalizedToolRequest,
  type ToolAffinity,
} from "./toolProtocol";
import {
  classifyUpstreamStatus,
  isEventStream,
  preflightStream,
  providerErrorEnvelope,
  type UpstreamFailure,
} from "./upstreamResponse";
import {
  isProviderCoolingDown,
  modelRouteKey,
  noteProviderFailure,
  noteProviderSuccess,
  noteToolResult,
  providerRouteKey,
  toolDemotedProviders as demotedToolProviders,
  toolTally,
  type RouteProvider,
} from "./routeHealth";
import {
  INCEPTION_BASE_URL,
  INCEPTION_MODELS,
  INCEPTION_PROVIDER_ID,
} from "./inception";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_MODELS,
  OPENROUTER_PROVIDER_ID,
} from "./openrouter";
import {
  MISTRAL_BASE_URL,
  MISTRAL_MODELS,
  MISTRAL_PROVIDER_ID,
  normalizeMistralParams,
} from "./mistral";
import {
  applyUpstreamRateLimitHeaders,
  consumeRateLimit,
  isRateLimitExhausted,
  noteRateLimitRejected,
} from "./rate-limit";

// A published 429 means the request counted against the budget even though it did not
// complete, so the rejection is booked against the same window as a success.
function noteFailure(provider: RouteProvider, model: string, status: number): void {
  noteProviderFailure(provider, model, status);
  if (status === 429) noteRateLimitRejected(provider, model);
}

const MAX_CHAT_BODY_BYTES = 4 * 1024 * 1024;
const MAX_PROVIDER_TIMEOUT_MS = 240_000;

export type AiProvider = {
  id: string;
  baseUrl: string;
  apiKey: string;
  format: string;
  models: string[];
  priority: number;
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function errorResponse(status: number, message: string, code = "invalid_request_error", headers: Record<string, string> = {}) {
  return jsonResponse({ error: { message, type: status >= 500 ? "server_error" : "invalid_request_error", code } }, status, headers);
}

function providersForModel(providers: AiProvider[], model: string, providerId?: string): AiProvider[] {
  const list = providerId
    ? providers.filter((candidate) => candidate.id === providerId)
    : selectProviders(providers, model);
  return list;
}

function retryHeaderNames(failures: UpstreamFailure[]): Record<string, string> {
  const codes = Array.from(new Set(failures.map((failure) => failure.code)));
  return { "x-omniroute-failure-codes": codes.join(","), "retry-after": "2" };
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function envProvider(): AiProvider | null {
  const id = firstEnv("OMNIROUTE_AI_PROVIDER_ID");
  const baseUrl = firstEnv("OMNIROUTE_AI_PROVIDER_BASE_URL");
  const apiKey = firstEnv("OMNIROUTE_AI_PROVIDER_API_KEY");
  if (!id || !baseUrl || !apiKey) return null;
  return {
    id,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    format: firstEnv("OMNIROUTE_AI_PROVIDER_FORMAT") || "openai",
    models: parseModels(firstEnv("OMNIROUTE_AI_PROVIDER_MODELS") || "[]"),
    priority: 0,
  };
}

const BUILTIN_OPTIONAL_PROVIDERS: AiProvider[] = [
  {
    id: "kilo-gateway",
    baseUrl: "https://api.kilo.ai/api/gateway",
    apiKey: "",
    format: "openai",
    priority: 980,
    models: [
      "kilo-auto/free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "minimax/minimax-m2.5:free",
      "arcee-ai/trinity-large-preview:free",
    ],
  },
  {
    id: GROQ_PROVIDER_ID,
    baseUrl: GROQ_BASE_URL,
    apiKey: "",
    format: "openai",
    priority: 990,
    models: GROQ_MODELS,
  },
  {
    id: OPENROUTER_PROVIDER_ID,
    baseUrl: OPENROUTER_BASE_URL,
    apiKey: "",
    format: "openai",
    priority: 970,
    models: OPENROUTER_MODELS,
  },
  {
    // Paid, so it sits below every free route: auto spends free capacity first and
    // only falls through to Inception when the free budgets are rate-limit spent.
    id: INCEPTION_PROVIDER_ID,
    baseUrl: INCEPTION_BASE_URL,
    apiKey: "",
    format: "openai",
    priority: 975,
    models: INCEPTION_MODELS,
  },
  {
    // Free mode, and the largest measured budget in the stack: 750 req/min and
    // 1.3M tokens/min on Ministral 3B. Ranks above Kilo and the metered providers,
    // but below Groq so auto keeps the stronger 27B model as its default.
    id: MISTRAL_PROVIDER_ID,
    baseUrl: MISTRAL_BASE_URL,
    apiKey: "",
    format: "openai",
    priority: 985,
    models: MISTRAL_MODELS,
  },
];

const EXCLUDED_ORIGINAL_MODELS = new Set([
  "kilo-gateway/minimax/minimax-m2.5:free",
  "kilo-gateway/arcee-ai/trinity-large-preview:free",
]);

function parseModels(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  if (typeof value === "string") {
    try {
      return parseModels(JSON.parse(value));
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

type BuiltinProviderEnv = {
  providerId: string;
  apiKeyNames: string[];
  baseUrlNames: string[];
  modelsNames: string[];
};

const BUILTIN_PROVIDER_ENV: BuiltinProviderEnv[] = [
  {
    providerId: "kilo-gateway",
    apiKeyNames: ["OMNIROUTE_KILO_API_KEY", "KILO_GATEWAY_API_KEY", "KILO_API_KEY"],
    baseUrlNames: ["OMNIROUTE_KILO_BASE_URL", "KILO_GATEWAY_BASE_URL", "KILO_BASE_URL"],
    modelsNames: ["OMNIROUTE_KILO_MODELS", "KILO_GATEWAY_MODELS", "KILO_MODELS"],
  },
  {
    providerId: GROQ_PROVIDER_ID,
    apiKeyNames: ["OMNIROUTE_GROQ_API_KEY", "GROQ_API_KEY", "GROQ_GATEWAY_API_KEY"],
    baseUrlNames: ["OMNIROUTE_GROQ_BASE_URL", "GROQ_API_BASE", "GROQ_BASE_URL"],
    modelsNames: ["OMNIROUTE_GROQ_MODELS", "GROQ_MODELS"],
  },
  {
    providerId: OPENROUTER_PROVIDER_ID,
    apiKeyNames: ["OMNIROUTE_OPENROUTER_API_KEY", "OPENROUTER_API_KEY"],
    baseUrlNames: ["OMNIROUTE_OPENROUTER_BASE_URL", "OPENROUTER_BASE_URL"],
    modelsNames: ["OMNIROUTE_OPENROUTER_MODELS", "OPENROUTER_MODELS"],
  },
  {
    providerId: INCEPTION_PROVIDER_ID,
    apiKeyNames: ["OMNIROUTE_INCEPTION_API_KEY", "INCEPTION_API_KEY", "MERCURY_API_KEY"],
    baseUrlNames: ["OMNIROUTE_INCEPTION_BASE_URL", "INCEPTION_BASE_URL"],
    modelsNames: ["OMNIROUTE_INCEPTION_MODELS", "INCEPTION_MODELS"],
  },
  {
    providerId: MISTRAL_PROVIDER_ID,
    apiKeyNames: ["OMNIROUTE_MISTRAL_API_KEY", "MISTRAL_API_KEY"],
    baseUrlNames: ["OMNIROUTE_MISTRAL_BASE_URL", "MISTRAL_BASE_URL"],
    modelsNames: ["OMNIROUTE_MISTRAL_MODELS", "MISTRAL_MODELS"],
  },
];

async function envConfiguredBuiltinProviders(): Promise<AiProvider[]> {
  const providers = await Promise.all(BUILTIN_PROVIDER_ENV.map(async (mapping) => {
    const builtin = BUILTIN_OPTIONAL_PROVIDERS.find((provider) => provider.id === mapping.providerId);
    const apiKey = firstEnv(...mapping.apiKeyNames);
    if (!builtin || !apiKey) return null;
    const baseUrl = (firstEnv(...mapping.baseUrlNames) || builtin.baseUrl).replace(/\/+$/, "");
    const configuredModels = parseModels(firstEnv(...mapping.modelsNames));
    // Catalog discovery is deliberately never performed on a request path.
    // A scheduled catalog refresher may persist models into Supabase later.
    const discoveredModels: string[] = [];
    const models = configuredModels.length ? configuredModels : discoveredModels.length ? discoveredModels : builtin.models;
    return {
      ...builtin,
      baseUrl,
      apiKey,
      models,
      // Keep the built-in keyless route first; use the environment key as a fallback.
      priority: builtin.priority + 1,
    } satisfies AiProvider;
  }));
  return providers.filter((provider): provider is AiProvider => provider !== null);
}

function providerFromRecord(record: ProviderConnectionRecord): AiProvider {
  const apiKey = typeof record.credentials.apiKey === "string"
    ? record.credentials.apiKey
    : typeof record.credentials.api_key === "string"
      ? record.credentials.api_key
      : "";
  return {
    id: record.providerId || record.id,
    baseUrl: record.baseUrl.replace(/\/+$/, ""),
    apiKey,
    format: record.format,
    models: record.models,
    priority: record.priority ?? 0,
  };
}

async function listProviders(dependencies: ParadRequestDependencies = {}): Promise<AiProvider[]> {
  const records = hasSupabaseGateway()
    ? (await listHotProviders()).map((provider) => ({ id: provider.id, providerId: provider.id, baseUrl: provider.baseUrl, format: provider.format, credentials: { apiKey: provider.apiKey }, models: provider.models, priority: provider.priority }))
    : await listProviderConnections(dependencies);
  const configured = records.map(providerFromRecord).filter((provider) => provider.baseUrl && (provider.apiKey || provider.id === "none"));
  const fallback = envProvider();
  const envBuiltins = await envConfiguredBuiltinProviders();
  const configuredIds = new Set(configured.map((provider) => provider.id));
  const builtins = BUILTIN_OPTIONAL_PROVIDERS.filter((provider) => !configuredIds.has(provider.id));
  const all = [...configured, ...(fallback ? [fallback] : []), ...envBuiltins, ...builtins];
  const deduped = all
    .filter((provider, index, values) => values.findIndex((candidate) => candidate.id === provider.id && candidate.baseUrl === provider.baseUrl && Boolean(candidate.apiKey) === Boolean(provider.apiKey)) === index);
  return deduped.sort((left, right) => (left.priority - right.priority));
}

function isExcludedModel(providerId: string, model: string): boolean {
  const providerQualifiedModel = model.startsWith(`${providerId}/`) ? model : `${providerId}/${model}`;
  return EXCLUDED_ORIGINAL_MODELS.has(providerQualifiedModel);
}

function modelMatches(provider: AiProvider, model: string): boolean {
  if (isExcludedModel(provider.id, model)) return false;
  if (model.startsWith("auto")) return true;
  if (!provider.models.length) return true;
  return provider.models.includes(model) || provider.models.includes(model.split("/").slice(1).join("/"));
}

function selectProviders(providers: AiProvider[], model: string): AiProvider[] {
  const requestedProvider = model.startsWith("auto/")
    ? model.slice("auto/".length)
    : model.includes("/")
      ? model.split("/", 1)[0]
      : null;
  return providers.filter((provider) => (!requestedProvider || provider.id === requestedProvider) && modelMatches(provider, model));
}

function selectProvider(providers: AiProvider[], model: string): AiProvider | null {
  return selectProviders(providers, model)[0] || null;
}

function providerModel(model: string, provider: AiProvider): string {
  if (!model.startsWith("auto/") && model.includes("/")) {
    const prefix = model.split("/", 1)[0];
    if (prefix === provider.id) return model.slice(prefix.length + 1);
  }
  return model.startsWith("auto") && provider.models.length ? provider.models[0] : model;
}

function extractUsage(payload: any): { inputTokens: number | null; outputTokens: number | null } {
  const usage = payload?.usage || {};
  return {
    inputTokens: Number.isFinite(Number(usage.prompt_tokens ?? usage.input_tokens)) ? Number(usage.prompt_tokens ?? usage.input_tokens) : null,
    outputTokens: Number.isFinite(Number(usage.completion_tokens ?? usage.output_tokens)) ? Number(usage.completion_tokens ?? usage.output_tokens) : null,
  };
}

function hasUsableAssistantText(payload: any, acceptToolCalls = false): boolean {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && Boolean(content.trim())) return true;
  // A valid agent-style completion may carry tool_calls with empty content;
  // that is a successful outcome, not an empty/malformed completion.
  if (acceptToolCalls && Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) return true;
  return false;
}

function providerSupportsToolProtocol(provider: AiProvider): boolean {
  const format = provider.format.toLowerCase();
  return !/(anthropic|claude|gemini|google|responses|messages)/.test(format);
}

function toolCompatibleFailure(failure: UpstreamFailure, wantsTools: boolean, isAuto: boolean): UpstreamFailure {
  if (wantsTools && isAuto && !failure.retryable) {
    return {
      retryable: true,
      code: "provider_tool_incompatible",
      message: "The provider could not use the canonical tool payload; trying another route",
    };
  }
  return failure;
}

function requestToolAffinity(request: Request, body: any, normalized: NormalizedToolRequest): ToolAffinity | null {
  const headerAffinity = decodeToolAffinity(request.headers.get(OMNIROUTE_TOOL_AFFINITY_HEADER));
  if (headerAffinity) return headerAffinity;
  const providerId = request.headers.get("x-omniroute-provider")?.trim();
  const model = request.headers.get("x-omniroute-model")?.trim();
  if (providerId && model) return { providerId, model: model.startsWith(`${providerId}/`) ? model : `${providerId}/${model}` };
  const bodyAffinity = decodeToolAffinity(body?.omniroute_tool_affinity ?? body?.tool_affinity);
  return bodyAffinity || normalized.affinity;
}

function streamWithUsage(body: ReadableStream<Uint8Array> | null, onComplete: () => void): ReadableStream<Uint8Array> | null {
  if (!body) return null;
  const reader = body.getReader();
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); onComplete(); return; }
        controller.enqueue(next.value);
      } catch (error) {
        // A mid-stream upstream failure must not propagate an errored stream to
        // the client (which Vercel would surface as a platform 502). The 200
        // status has already been committed, so close gracefully and record the
        // usage event instead.
        try { await reader.cancel(); } catch { /* ignore */ }
        controller.close();
        onComplete();
      }
    },
    cancel(reason) { void reader.cancel(reason).catch(() => undefined); onComplete(); },
  });
}

async function authenticateGatewayRequest(
  request: Request,
  dependencies: ParadRequestDependencies,
): Promise<{ policy: AiApiKeyPolicy | null; response: Response | null }> {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const supplied = match?.[1].trim() || "";
  const expected = process.env.OMNIROUTE_AI_API_KEY?.trim();
  if (expected && supplied && constantTimeEqual(supplied, expected)) return { policy: null, response: null };
  if (!supplied) return { policy: null, response: errorResponse(401, "Invalid or missing API key", "invalid_api_key") };

  const policies = hasSupabaseGateway() ? await listHotPolicies() : await listApiKeyPolicies(dependencies);
  const policy = hasSupabaseGateway()
    ? findHotPolicy(policies, supplied) as AiApiKeyPolicy | null
    : policies.find((candidate) => constantTimeEqual(candidate.keyHash, hashApiKey(supplied))) || null;
  if (!policy) return { policy: null, response: errorResponse(401, "Invalid or missing API key", "invalid_api_key") };
  if (policy.expiresAt && Date.parse(policy.expiresAt) <= Date.now()) return { policy: null, response: errorResponse(401, "API key has expired", "expired_api_key") };
  return { policy, response: null };
}

function policyAllows(policy: AiApiKeyPolicy | null, endpoint: string, model: string): Response | null {
  if (!policy) return null;
  if (policy.allowedEndpoints.length && !policy.allowedEndpoints.includes(endpoint)) return errorResponse(403, "API key is not permitted to use this endpoint", "endpoint_not_allowed");
  if (policy.allowedModels.length && !model.startsWith("auto") && !policy.allowedModels.includes(model)) return errorResponse(403, "API key is not permitted to use this model", "model_not_allowed");
  return null;
}

async function recordUsage(provider: AiProvider, model: string, endpoint: string, status: string, payload: any, policy: AiApiKeyPolicy | null, startedAt: number, dependencies: ParadRequestDependencies) {
  const { inputTokens, outputTokens } = extractUsage(payload);
  const event = {
    id: randomUUID(),
    apiKeyId: policy?.id ?? null,
    providerId: provider.id,
    model,
    endpoint,
    status,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
  };
  // Queue persistence is intentionally post-response work. Parad is not on the
  // synchronous chat path; the durable queue is the accounting boundary.
  if (hasSupabaseGateway()) void enqueueUsageEvent(event).catch(() => undefined);
  else void recordAiUsageEvent(event, dependencies).catch(() => undefined);
}

export async function getAiOnlyModels(request: Request, dependencies: ParadRequestDependencies = {}) {
  const { response } = await authenticateGatewayRequest(request, dependencies);
  if (response) return response;
  const providers = await listProviders(dependencies);
  const overrides = hasSupabaseGateway() ? await listHotModelOverrides() : await listModelOverrides(dependencies);
  const data = providers.flatMap((provider) => provider.models
    .filter((id) => !isExcludedModel(provider.id, id))
    .map((id) => {
      const modelId = id.startsWith(`${provider.id}/`) ? id : `${provider.id}/${id}`;
      return { id: modelId, object: "model", owned_by: provider.id, ...getAiModelMetadata(modelId, provider.id) };
    }))
    .concat(overrides.filter((override) => !isExcludedModel(override.providerId, override.modelId)).map((override) => {
      const modelId = `${override.providerId}/${override.modelId}`;
      return { id: modelId, object: "model", owned_by: override.providerId, ...getAiModelMetadata(modelId, override.providerId), ...(override.displayName ? { name: override.displayName } : {}), ...override.capabilities };
    }))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  return jsonResponse({ object: "list", data });
}

export async function getAiGatewayHealth(dependencies: ParadRequestDependencies = {}) {
  let supabase = await checkSupabaseHealth();
  let migration = { attempted: false, applied: false, detail: "not_needed" };
  // Re-run the (idempotent) migration whenever the schema is missing or behind
  // the latest version so new tables/RPCs self-deploy without manual SQL.
  const needsMigration = Boolean(supabase.configured) && (supabase.tablesMissing || supabase.schemaVersion === null || supabase.schemaVersion < SCHEMA_VERSION);
  if (needsMigration) {
    migration = { attempted: true, applied: false, detail: "attempting" };
    const result = await applySupabaseMigration();
    migration = { attempted: true, applied: result.applied, detail: result.message || result.reason || (result.applied ? "applied" : "not_applied") };
    supabase = await checkSupabaseHealth();
  }
  const providers = await listProviders(dependencies);
  const uniqueProviders = providers.filter((provider, index, all) => all.findIndex((candidate) => candidate.id === provider.id) === index);
  const modelCount = uniqueProviders.reduce((total, provider) => total + provider.models.filter((id) => !isExcludedModel(provider.id, id)).length, 0);
  const gatewayKey = Boolean(process.env.OMNIROUTE_AI_API_KEY?.trim());
  const providerCatalogOk = uniqueProviders.length > 0;
  // Supabase is an optimization. The gateway only considers itself DOWN when it
  // cannot serve with any source: configured-and-unreachable Supabase with no
  // builtin fallback, or no providers at all.
  const ready = providerCatalogOk;
  const checks = [
    { name: "gateway", status: "ok", detail: `providers:${uniqueProviders.length} models:${modelCount} key_config:${gatewayKey ? "env" : "none"}` },
    { name: "migration", status: migration.attempted ? migration.applied ? "ok" : "degraded" : "ok", detail: migration.detail },
    { name: "supabase", status: supabase.configured ? supabase.reachable ? (supabase.tablesMissing ? "degraded" : "ok") : "degraded" : "not_configured", detail: supabase.tablesMissing ? "schema_missing" : supabase.error || (supabase.reachable ? "reachable" : "configured") },
    { name: "providers", status: providerCatalogOk ? "ok" : "down", detail: uniqueProviders.map((provider) => `${provider.id}:${provider.models.filter((id) => !isExcludedModel(provider.id, id)).length}`).join(",") || "none" },
  ];
  return jsonResponse({ status: ready ? "ok" : "degraded", ready, uptime: process.uptime(), checks }, ready ? 200 : 503);
}

export type AiJsonEndpointOptions = {
  providerId?: string;
  upstreamPath?: string;
  endpointName?: string;
  requireModel?: boolean;
  streamResponse?: boolean;
  binaryResponse?: boolean;
};

function upstreamHeaders(provider: AiProvider): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;

  if (provider.format.toLowerCase().includes("claude") || provider.format.toLowerCase().includes("anthropic")) {
    delete headers.authorization;
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }
  return headers;
}

function bodyModel(body: any): string {
  return typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "auto";
}

export async function handleAiOnlyJsonEndpoint(
  request: Request,
  endpoint: string,
  dependencies: ParadRequestDependencies = {},
  options: AiJsonEndpointOptions = {},
) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return errorResponse(415, "Content-Type must be application/json", "unsupported_media_type");
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_CHAT_BODY_BYTES) return errorResponse(413, "Request body exceeds the 4 MiB AI profile limit", "payload_too_large");
  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return errorResponse(400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(400, "Request body must be a JSON object");
  const model = bodyModel(body);
  if (options.requireModel && model === "auto") return errorResponse(400, "model must be a non-empty string");
  const policyFailure = policyAllows(policy, options.endpointName || endpoint, model);
  if (policyFailure) return policyFailure;
  const providers = await listProviders(dependencies);
  const candidates = providersForModel(providers, model, options.providerId);
  if (!candidates.length) return errorResponse(503, options.providerId ? `No configured provider ${options.providerId}` : `No configured provider can serve model ${model}`, "provider_unavailable");
  if (options.providerId && model !== "auto" && model.includes("/")) {
    const prefix = model.split("/", 1)[0];
    if (prefix !== options.providerId) return errorResponse(400, `Model "${model}" does not belong to provider "${options.providerId}"`, "model_provider_mismatch");
  }
  const upstreamPath = (options.upstreamPath || endpoint).replace(/^\/+|\/+$/g, "");
  const failures: UpstreamFailure[] = [];
  for (const provider of candidates) {
    if (isProviderCoolingDown(provider, model) || isRateLimitExhausted(provider, model)) continue;
    const upstreamModel = model === "auto" ? model : providerModel(model, provider);
    const upstreamBody = model === "auto" || typeof body.model !== "string" ? body : { ...body, model: upstreamModel };
    const upstreamUrl = `${provider.baseUrl}/${upstreamPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const upstream = await fetch(upstreamUrl, { method: "POST", headers: upstreamHeaders(provider), body: JSON.stringify(upstreamBody), signal: controller.signal });
      if (options.streamResponse || body.stream === true) {
        if (!upstream.ok) {
          const failure = classifyUpstreamStatus(upstream.status) || { retryable: true, code: "provider_unavailable", message: "The upstream provider could not serve the request" };
          failures.push(failure);
          noteFailure(provider, model, upstream.status);
          await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
          if (failure.retryable) continue;
          return errorResponse(503, failure.message, failure.code, retryHeaderNames(failures));
        }
        return new Response(upstream.body, { status: 200, headers: { "content-type": upstream.headers.get("content-type") || "text/event-stream", "cache-control": "no-cache", "x-omniroute-provider": provider.id } });
      }
      if (!upstream.ok) {
        const failure = classifyUpstreamStatus(upstream.status) || { retryable: true, code: "provider_unavailable", message: "The upstream provider could not serve the request" };
        failures.push(failure);
        noteFailure(provider, model, upstream.status);
        await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
        if (failure.retryable) continue;
        return errorResponse(503, failure.message, failure.code, retryHeaderNames(failures));
      }
      if (options.binaryResponse) {
        const bytes = await upstream.arrayBuffer();
        await recordUsage(provider, model, options.endpointName || endpoint, "succeeded", {}, policy, startedAt, dependencies);
        return new Response(bytes, { status: 200, headers: { "content-type": upstream.headers.get("content-type") || "application/octet-stream", "x-omniroute-provider": provider.id } });
      }
      const responseBody = await upstream.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));
      await recordUsage(provider, model, options.endpointName || endpoint, "succeeded", responseBody, policy, startedAt, dependencies);
      return jsonResponse(responseBody, 200, { "x-omniroute-provider": provider.id });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      failures.push({ retryable: true, code: "provider_timeout", message: timedOut ? "The provider request timed out" : "The provider request failed" });
      noteFailure(provider, model, timedOut ? 408 : 500);
      await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  const primaryMessage = failures.length ? failures[failures.length - 1].message : "No currently available provider could serve this request";
  return errorResponse(503, primaryMessage, "provider_pool_exhausted", retryHeaderNames(failures));
}

export type AiMultipartEndpointOptions = {
  providerId?: string;
  upstreamPath?: string;
  endpointName?: string;
  maxBytes?: number;
  requireModel?: boolean;
};

export async function handleAiOnlyMultipartEndpoint(
  request: Request,
  endpoint: string,
  dependencies: ParadRequestDependencies = {},
  options: AiMultipartEndpointOptions = {},
) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return errorResponse(415, "Content-Type must be multipart/form-data", "unsupported_media_type");
  const raw = Buffer.from(await request.arrayBuffer());
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  if (raw.length > maxBytes) return errorResponse(413, `Multipart request exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MiB AI profile limit`, "payload_too_large");
  const form = new FormData();
  const source = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: raw }).formData();
  let model = "auto";
  for (const [key, value] of source.entries()) {
    if (key === "model" && typeof value === "string") model = value.trim() || "auto";
    if (typeof value === "string") form.append(key, value);
    else form.append(key, value, value.name);
  }
  if (options.requireModel && model === "auto") return errorResponse(400, "model must be a non-empty string");
  const policyFailure = policyAllows(policy, options.endpointName || endpoint, model);
  if (policyFailure) return policyFailure;
  const providers = await listProviders(dependencies);
  const candidates = providersForModel(providers, model, options.providerId);
  if (!candidates.length) return errorResponse(503, options.providerId ? `No configured provider ${options.providerId}` : `No configured provider can serve model ${model}`, "provider_unavailable");
  const upstreamPath = (options.upstreamPath || endpoint).replace(/^\/+|\/+$/g, "");
  const failures: UpstreamFailure[] = [];
  for (const provider of candidates) {
    if (isProviderCoolingDown(provider, model)) continue;
    const upstreamModel = model === "auto" ? model : providerModel(model, provider);
    const upstreamBody = new FormData();
    for (const [key, value] of form.entries()) {
      if (key === "model") upstreamBody.append(key, upstreamModel);
      else upstreamBody.append(key, value);
    }
    const upstreamUrl = `${provider.baseUrl}/${upstreamPath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const upstream = await fetch(upstreamUrl, { method: "POST", headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}, body: upstreamBody, signal: controller.signal });
      if (!upstream.ok) {
        const failure = classifyUpstreamStatus(upstream.status) || { retryable: true, code: "provider_unavailable", message: "The upstream provider could not serve the request" };
        failures.push(failure);
        noteFailure(provider, model, upstream.status);
        await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
        if (failure.retryable) continue;
        return errorResponse(503, failure.message, failure.code, retryHeaderNames(failures));
      }
      const responseBody = await upstream.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));
      await recordUsage(provider, model, options.endpointName || endpoint, "succeeded", responseBody, policy, startedAt, dependencies);
      return jsonResponse(responseBody, 200, { "x-omniroute-provider": provider.id });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      failures.push({ retryable: true, code: "provider_timeout", message: timedOut ? "The provider request timed out" : "The provider request failed" });
      noteFailure(provider, model, timedOut ? 408 : 500);
      await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  const primaryMessage = failures.length ? failures[failures.length - 1].message : "No currently available provider could serve this request";
  return errorResponse(503, primaryMessage, "provider_pool_exhausted", retryHeaderNames(failures));
}

function fileMetadata(file: { id: string; bytes: number; filename: string; purpose: string; mimeType?: string | null; expiresAt?: string | null; createdAt: string }) {
  return { id: file.id, object: "file", bytes: file.bytes, created_at: Math.floor(Date.parse(file.createdAt) / 1000), filename: file.filename, purpose: file.purpose, status: "processed", status_details: null, ...(file.mimeType ? { mime_type: file.mimeType } : {}), ...(file.expiresAt ? { expires_at: Math.floor(Date.parse(file.expiresAt) / 1000) } : {}) };
}

export async function handleAiOnlyFileUpload(request: Request, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > 4 * 1024 * 1024) return errorResponse(413, "File upload exceeds the 4 MiB AI profile limit; use an external object-storage reference for larger files", "payload_too_large");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return errorResponse(415, "Content-Type must be multipart/form-data", "unsupported_media_type");
  const form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: raw }).formData().catch(() => null);
  const file = form?.get("file");
  const purpose = form?.get("purpose");
  if (!(file instanceof File) || typeof purpose !== "string" || !purpose.trim()) return errorResponse(400, "Missing file or purpose");
  const content = new Uint8Array(await file.arrayBuffer());
  const id = `file-${randomUUID()}`;
  await createAiFile({ id, apiKeyId: policy?.id ?? null, bytes: file.size, filename: file.name, purpose: purpose.trim(), mimeType: file.type || null, content }, dependencies);
  return jsonResponse(fileMetadata({ id, bytes: file.size, filename: file.name, purpose: purpose.trim(), mimeType: file.type || null, createdAt: new Date().toISOString() }));
}

export async function handleAiOnlyFileList(request: Request, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "GET") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const files = await listAiFiles(policy?.id ?? null, dependencies);
  const data = files.map(fileMetadata);
  return jsonResponse({ object: "list", data, has_more: false });
}

export async function handleAiOnlyFileMetadata(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "GET") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const file = await getAiFile(id, policy?.id ?? null, dependencies);
  if (!file) return errorResponse(404, "File not found", "file_not_found");
  return jsonResponse(fileMetadata(file));
}

export async function handleAiOnlyFileContent(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "GET") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const file = await getAiFile(id, policy?.id ?? null, dependencies);
  if (!file) return errorResponse(404, "File not found", "file_not_found");
  return new Response(file.content, { headers: { "content-type": file.mimeType || "application/octet-stream", "content-disposition": `attachment; filename="${file.filename.replace(/[\"\\\r\n]/g, "_")}"` } });
}

export async function handleAiOnlyFileDelete(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "DELETE") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const deleted = await deleteAiFile(id, policy?.id ?? null, dependencies);
  if (!deleted) return errorResponse(404, "File not found", "file_not_found");
  return jsonResponse({ id, object: "file", deleted: true });
}

function jobResponse(job: any) {
  return { id: job.id, object: job.kind === "batch" ? "batch" : "ai_job", kind: job.kind, status: job.status, request: job.request, result: job.result ?? null, error: job.error ?? null, callback_url: job.callbackUrl ?? null, attempts: job.attempts, created_at: job.createdAt, started_at: job.startedAt ?? null, finished_at: job.finishedAt ?? null };
}

async function dispatchAiJob(job: any) {
  const dispatchUrl = process.env.OMNIROUTE_JOB_DISPATCH_URL?.trim();
  if (!dispatchUrl) return;
  const secret = process.env.OMNIROUTE_JOB_DISPATCH_SECRET?.trim();
  await fetch(dispatchUrl, { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-omniroute-job-secret": secret } : {}) }, body: JSON.stringify({ id: job.id, kind: job.kind }) }).catch(() => undefined);
}

export async function handleAiJobCreate(request: Request, kind: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_CHAT_BODY_BYTES) return errorResponse(413, "Job request exceeds the 4 MiB AI profile limit", "payload_too_large");
  let body: any;
  try { body = JSON.parse(raw.toString("utf8")); } catch { return errorResponse(400, "Request body must be valid JSON"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse(400, "Request body must be a JSON object");
  const callbackUrl = typeof body.callback_url === "string" && /^https:\/\//i.test(body.callback_url) ? body.callback_url : null;
  const id = `job-${randomUUID()}`;
  await createAiJob({ id, apiKeyId: policy?.id ?? null, kind, request: body, callbackUrl }, dependencies);
  const job = { id, kind, status: "queued", request: body, callbackUrl, attempts: 0, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, result: null, error: null };
  void dispatchAiJob(job);
  return jsonResponse(jobResponse(job), 202, { "x-omniroute-job-id": id });
}

export async function handleAiJobList(request: Request, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "GET") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const jobs = await listAiJobs(policy?.id ?? null, 100, dependencies);
  return jsonResponse({ object: "list", data: jobs.map(jobResponse), has_more: false });
}

export async function handleAiJobGet(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "GET") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const job = await getAiJob(id, policy?.id ?? null, dependencies);
  if (!job) return errorResponse(404, "Job not found", "job_not_found");
  return jsonResponse(jobResponse(job));
}

export async function handleAiJobCancel(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const job = await getAiJob(id, policy?.id ?? null, dependencies);
  if (!job) return errorResponse(404, "Job not found", "job_not_found");
  if (["completed", "failed", "cancelled", "expired"].includes(job.status)) return jsonResponse(jobResponse(job), 409);
  await updateAiJob(id, policy?.id ?? null, { status: "cancelled", cancelRequested: true, finishedAt: new Date().toISOString() }, dependencies);
  return jsonResponse(jobResponse({ ...job, status: "cancelled", cancelRequested: true, finishedAt: new Date().toISOString() }));
}

export async function handleAiJobRetry(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const job = await getAiJob(id, policy?.id ?? null, dependencies);
  if (!job) return errorResponse(404, "Job not found", "job_not_found");
  if (!["failed", "cancelled", "expired"].includes(job.status)) return jsonResponse(jobResponse(job), 409);
  const next = { ...job, status: "queued", attempts: job.attempts + 1, error: null, result: null, cancelRequested: false, availableAt: new Date().toISOString(), startedAt: null, finishedAt: null };
  await updateAiJob(id, policy?.id ?? null, next, dependencies);
  void dispatchAiJob(next);
  return jsonResponse(jobResponse(next), 202);
}

export async function handleAiJobComplete(request: Request, id: string, dependencies: ParadRequestDependencies = {}) {
  const expected = process.env.OMNIROUTE_JOB_CALLBACK_SECRET?.trim();
  if (!expected || request.headers.get("x-omniroute-job-secret") !== expected) return errorResponse(401, "Invalid job worker secret", "invalid_worker_secret");
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const body = await request.json().catch(() => null) as any;
  if (!body || !["completed", "failed"].includes(body.status)) return errorResponse(400, "status must be completed or failed");
  const job = await getAiJob(id, null, dependencies);
  if (!job) return errorResponse(404, "Job not found", "job_not_found");
  await updateAiJob(id, null, { status: body.status, result: body.result ?? null, error: body.error ?? null, finishedAt: new Date().toISOString() }, dependencies);
  return jsonResponse({ ok: true, id, status: body.status });
}

const MAX_AUTO_SECONDARY_CANDIDATES = 21;
const AGENT_FAST_DEADLINE_MS = 3_000;
const AGENT_BALANCED_DEADLINE_MS = 8_000;
const QUALITY_DEADLINE_MS = 20_000;
function autoModelScore(provider: AiProvider, model: string): number {
  const metadata = getAiModelMetadata(model, provider.id);
  if (!["text-chat", "text-chat-vision-candidate"].includes(metadata.modality)) return Number.NEGATIVE_INFINITY;
  const source = model.slice(`${provider.id}/`.length).toLowerCase();
  if (source === "auto" || source.includes("auto/free")) return Number.NEGATIVE_INFINITY;
  let score = 4_000;
  score += metadata.quality_tier === "strong-candidate" ? 500 : metadata.quality_tier === "curated-free" ? 450 : metadata.quality_tier === "curated-gateway" ? 400 : metadata.quality_tier === "community-experimental" ? 100 : 200;
  const modelSignals: Array<[RegExp, number]> = [
    [/claude/, 1_200],
    [/gpt-5\.6|gpt-5\.5|gpt-5\.4/, 1_150],
    [/gpt-5\.2|gpt-5\.1/, 1_100],
    [/kimi[- ]?k3/, 1_050],
    [/glm[- ]?5\.[234]|z-ai\/glm-5/, 1_025],
    [/qwen3\.8|max/, 1_000],
    [/deepseek-v4|deepseek-r1/, 975],
    [/gemini.*latest|gemini.*2\./, 950],
    [/grok-4/, 925],
    [/minimax-m3/, 900],
    [/nemotron.*(ultra|super)/, 875],
    [/mimo-v2\.5/, 850],
  ];
  for (const [pattern, bonus] of modelSignals) {
    if (pattern.test(source)) {
      score += bonus;
      break;
    }
  }
  if (/uncensor|heretic|unmoderated|abliterated|aggressive/.test(source)) score -= 1_500;
  if (metadata.confidence === "low") score -= 25;
  return score;
}

function rankedProviderModels(provider: AiProvider): string[] {
  return provider.models
    .map((model) => canonicalProviderModel(provider, model))
    .filter((model, index, all) => all.indexOf(model) === index)
    .filter((model) => autoModelScore(provider, model) !== Number.NEGATIVE_INFINITY)
    .sort((left, right) => autoModelScore(provider, right) - autoModelScore(provider, left) || left.localeCompare(right));
}

// Adaptive auto pool: dynamic discovery (whatever the provider can serve today)
// + runtime telemetry, in a fixed provider priority order. Telemetry only demotes
// demonstrably broken routes (quarantine) to the tail; it never reorders which
// provider leads. When every candidate is unhealthy the pool still degrades
// gracefully instead of hard-503ing.
const AUTO_PROVIDER_PRIORITY = ["kilo-gateway"];

function providerPriorityIndex(provider: AiProvider): number {
  const index = AUTO_PROVIDER_PRIORITY.indexOf(provider.id);
  return index === -1 ? AUTO_PROVIDER_PRIORITY.length : index;
}

function attemptTrailHeader(attemptTrail: string[]): string {
  return attemptTrail.length ? attemptTrail.slice(0, 12).join(",").slice(0, 512) : "none";
}

const POOL_HEALTH_TTL_MS = 30_000;
let poolHealthCache: Map<string, UsageHealthRow> | null = null;
let poolHealthCacheAt = 0;

function canonicalProviderModel(provider: AiProvider, model: string): string {
  return model.startsWith(`${provider.id}/`) ? model : `${provider.id}/${model}`;
}

async function getPoolHealth(): Promise<Map<string, UsageHealthRow>> {
  const now = Date.now();
  if (poolHealthCache && now - poolHealthCacheAt < POOL_HEALTH_TTL_MS) return poolHealthCache;
  // Supabase is the telemetry store; Parad-only deployments just skip health
  // ranking and still get the full quality-ranked pool (best effort).
  const rows = hasSupabaseGateway() ? await getHotUsageHealth() : [];
  const map = new Map<string, UsageHealthRow>();
  // q.model already carries the provider-qualified id (e.g.
  // "kilo-gateway/nvidia/..."), which matches how the candidate pool identifies
  // models, so store the row under that exact key.
  for (const row of rows) map.set(row.model, row);
  poolHealthCache = map;
  poolHealthCacheAt = now;
  return map;
}

function isQuarantinedHealth(row: UsageHealthRow): boolean {
  if (row.attempts < 3) return false;
  const streak = (row.recent_statuses || []).slice(0, 3);
  if (streak.length >= 3 && streak.every((status) => status !== "succeeded")) return true;
  if (row.attempts >= 5 && row.failures / row.attempts >= 0.5) return true;
  return false;
}

async function autoModelCandidates(providers: AiProvider[], providerScope?: string, wantsTools = false, preferredAffinity?: ToolAffinity | null): Promise<string[]> {
  const inScope = (provider: AiProvider) => !providerScope || provider.id === providerScope;
  const scopedProviders = providers
    .filter(inScope)
    .filter((provider) => !wantsTools || providerSupportsToolProtocol(provider))
    .sort((a, b) => providerPriorityIndex(a) - providerPriorityIndex(b) || a.priority - b.priority);
  const health = await getPoolHealth().catch(() => new Map<string, UsageHealthRow>());
  const entries = scopedProviders.flatMap((provider) =>
    rankedProviderModels(provider).map((model) => {
      const row = health.get(model);
      const quarantined = row ? isQuarantinedHealth(row) : false;
      const key = modelRouteKey(provider, model);
      const reliability = row && row.attempts > 0 ? (row.attempts - row.failures) / row.attempts : null;
      const latency = row?.avg_latency_ms ?? null;
      let score = autoModelScore(provider, model);
      if (reliability !== null) score += (reliability - 0.5) * 600;
      if (latency !== null && Number.isFinite(latency)) score -= latency / 40;
      if (wantsTools) {
        const tally = toolTally(provider, model);
        score += tally.successes * 60;
        score -= tally.failures * 120;
      }
      return { provider, model, score, quarantined };
    }),
  );
  // Walk providers in fixed priority; within a provider sort by model quality.
  // Tool workflows first set aside providers that have already failed tool calls
  // in this instance, so a dead route cannot keep leading the pool by priority
  // alone and starve a provider that can actually serve tools.
  const demoted = wantsTools ? await demotedToolProviders(scopedProviders, (provider: AiProvider) => rankedProviderModels(provider)) : new Map<string, boolean>();
  const pool = entries.sort((a, b) =>
    (demoted.get(a.provider.id) ? 1 : 0) - (demoted.get(b.provider.id) ? 1 : 0)
    || providerPriorityIndex(a.provider) - providerPriorityIndex(b.provider)
    || b.score - a.score || a.model.localeCompare(b.model),
  );
  const eager: string[] = [];
  const tail: string[] = [];
  for (const entry of pool) {
    (entry.quarantined ? tail : eager).push(entry.model);
  }
  const candidates = [...eager, ...tail];
  // Lead the batch with one best model per provider so a batch pass never burns
  // the whole (truncated) candidate list inside the first route it tries.
  const leaders: string[] = [];
  const rest: string[] = [];
  const seenLeadingProvider = new Set<string>();
  for (const model of candidates) {
    const providerId = model.split("/", 1)[0];
    if (!seenLeadingProvider.has(providerId)) {
      seenLeadingProvider.add(providerId);
      leaders.push(model);
    } else {
      rest.push(model);
    }
  }
  const ordered = [...leaders, ...rest];
  const configured = parseModels(process.env.OMNIROUTE_AI_AUTO_MODELS || "");
  const selected = configured.length ? configured.filter((model) => ordered.includes(model)) : ordered;
  if (!preferredAffinity || (providerScope && providerScope !== preferredAffinity.providerId)) return selected;
  const preferredModel = preferredAffinity.model.startsWith(`${preferredAffinity.providerId}/`)
    ? preferredAffinity.model
    : `${preferredAffinity.providerId}/${preferredAffinity.model}`;
  return selected.includes(preferredModel)
    ? [preferredModel, ...selected.filter((model) => model !== preferredModel)]
    : selected;
}

export async function handleAiOnlyChatCompletions(request: Request, dependencies: ParadRequestDependencies = {}, options: { providerId?: string } = {}) {
  const { policy, response: authFailure } = await authenticateGatewayRequest(request, dependencies);
  if (authFailure) return authFailure;
  if (request.method !== "POST") return errorResponse(405, "Method not allowed", "method_not_allowed");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) return errorResponse(415, "Content-Type must be application/json", "unsupported_media_type");
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_CHAT_BODY_BYTES) return errorResponse(413, "Request body exceeds the 4 MiB AI profile limit", "payload_too_large");
  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return errorResponse(400, "Request body must be valid JSON");
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.messages) || body.messages.length === 0) return errorResponse(400, "messages must be a non-empty array");
  if (body.model !== undefined && typeof body.model !== "string") return errorResponse(400, "model must be a string");

  const toolRequest = normalizeChatToolRequest(body, { injectPrompt: !supportsNativeToolCalls(bodyModel(body)) });
  if (toolRequest.invalidToolDefinition) return errorResponse(400, "tools must contain valid function definitions and tool_choice must be valid");
  const requestBody = toolRequest.body;
  const requestedModel = bodyModel(requestBody);
  const routingClass = (body.routing_class === "agent-fast" || body.routing_class === "agent-balanced" || body.routing_class === "quality"
    ? body.routing_class
    : requestedModel === "quality" ? "quality"
    : requestedModel === "agent-fast" ? "agent-fast"
    : requestedModel === "agent-balanced" ? "agent-balanced"
    : "auto");
  const isProviderAuto = requestedModel.startsWith("auto/") && requestedModel !== "auto/free";
  const requestedProviderScope = isProviderAuto ? requestedModel.slice("auto/".length) : undefined;
  if (options.providerId && requestedProviderScope && requestedProviderScope !== options.providerId) return errorResponse(400, `Model "${requestedModel}" does not belong to provider "${options.providerId}"`, "model_provider_mismatch");
  if (options.providerId && requestedModel !== "auto" && !isProviderAuto && requestedModel.includes("/")) {
    const prefix = requestedModel.split("/", 1)[0];
    if (prefix !== options.providerId) return errorResponse(400, `Model "${requestedModel}" does not belong to provider "${options.providerId}"`, "model_provider_mismatch");
  }
  const isAuto = requestedModel === "auto" || requestedModel === "auto/free" || isProviderAuto || routingClass !== "auto";
  const providerScope = options.providerId || requestedProviderScope;
  const policyFailure = policyAllows(policy, "chat.completions", requestedModel);
  if (policyFailure) return policyFailure;
  if (promptGuardEnabled()) {
    const screen = await screenPrompt(latestUserText(requestBody.messages));
    if (screen.blocked) {
      return errorResponse(400, `Request blocked by prompt guard (score ${screen.score})`, "prompt_guard_blocked", { "x-omniroute-guard-score": String(screen.score) });
    }
  }
  const providers = await listProviders(dependencies);
  const wantsTools = toolRequest.hasToolIntent;
  const toolWorkflow = wantsTools || toolRequest.hasToolResult;
  const preferredAffinity = isAuto ? requestToolAffinity(request, body, toolRequest) : null;
  const models = isAuto
    ? (await autoModelCandidates(providers, providerScope, wantsTools, preferredAffinity)).slice(0, MAX_AUTO_SECONDARY_CANDIDATES + 1)
    : [requestedModel];
  if (!models.length) {
    return wantsTools
      ? errorResponse(503, "No currently available provider supports the canonical tool protocol", "tool_protocol_unavailable")
      : errorResponse(503, "No currently available model can serve this request", "provider_unavailable");
  }

  let lastResponse: Response | null = null;
  let lastRetryableStatus: number | null = null;
  let lastFailureMessage = "No currently available provider could serve this request";
  let lastFailureCode = "provider_unavailable";
  let attempt = 0;
  let attemptedAny = false;
  let cooldownBypassUsed = false;
  const cooldownBypassRoutes = new Set<string>();
  const attemptTrail: string[] = [];
  for (const model of models) {
    const providerCandidates = selectProviders(providers, model).filter((provider) => !options.providerId || provider.id === options.providerId);
    for (const provider of providerCandidates) {
      const coolingDown = isProviderCoolingDown(provider, model);
      const rateLimited = isRateLimitExhausted(provider, model);
      // When every candidate is in cooldown, still give the top of the pool one
      // best-effort attempt so a saturated free pool degrades onto a real probe
      // instead of failing out with no attempt at all. Tool workflows get one
      // probe per route, otherwise a single leading route would consume the only
      // bypass and starve a healthy model of the same provider further down.
      // A spent published budget joins the same pool: the point of a limit here is
      // to fall through to the next model, not to fail the request on this one.
      if ((coolingDown || rateLimited) && (cooldownBypassRoutes.has(modelRouteKey(provider, model)) || (!wantsTools && (attemptedAny || cooldownBypassUsed)))) continue;
      if (coolingDown || rateLimited) {
        cooldownBypassRoutes.add(modelRouteKey(provider, model));
        if (!wantsTools) cooldownBypassUsed = true;
      }

      attemptedAny = true;
      const upstreamModel = providerModel(model, provider);
      const route = { providerId: provider.id, model };
      const endpoint = `${provider.baseUrl}/chat/completions`;
      const controller = new AbortController();
      const phase = toolRequest.hasToolResult
        ? "quality"
        : wantsTools
          ? routingClass === "quality" ? "quality" : "balanced"
          : !isAuto || routingClass === "quality"
            ? "quality"
            : routingClass === "agent-balanced"
              ? (attempt === 0 ? "balanced" : "quality")
              : (attempt === 0 ? "fast" : attempt === 1 ? "balanced" : "quality");
      const deadline = toolRequest.hasToolResult
        ? (isAuto ? QUALITY_DEADLINE_MS : MAX_PROVIDER_TIMEOUT_MS)
        : wantsTools
          ? (routingClass === "quality" ? (isAuto ? QUALITY_DEADLINE_MS : MAX_PROVIDER_TIMEOUT_MS) : AGENT_BALANCED_DEADLINE_MS)
          : phase === "fast" ? AGENT_FAST_DEADLINE_MS : phase === "balanced" ? AGENT_BALANCED_DEADLINE_MS : (isAuto ? QUALITY_DEADLINE_MS : MAX_PROVIDER_TIMEOUT_MS);
      attempt += 1;
      const timeout = setTimeout(() => controller.abort(), deadline);
      const startedAt = Date.now();
      try {
        const floored = withMaxTokensFloor(requestBody, upstreamModel);
        const upstreamBody = provider.id === MISTRAL_PROVIDER_ID ? normalizeMistralParams(floored.body) : floored.body;
        const upstream = await fetch(endpoint, {
          method: "POST",
          headers: upstreamHeaders(provider),
          body: JSON.stringify({ ...upstreamBody, model: upstreamModel }),
          signal: controller.signal,
        });
        if (requestBody.stream === true) {
          if (!upstream.ok || !isEventStream(upstream.headers.get("content-type"))) {
            await upstream.body?.cancel().catch(() => undefined);
            const status = upstream.ok ? 502 : upstream.status;
            const failure = toolCompatibleFailure(classifyUpstreamStatus(status) || { retryable: true, code: "provider_unavailable", message: "The upstream provider could not serve the request" }, wantsTools, isAuto);
            await recordUsage(provider, model, "chat.completions", "failed", {}, policy, startedAt, dependencies);
            lastRetryableStatus = status;
            attemptTrail.push(`${model}:${status}`);
            noteFailure(provider, model, status);
            if (wantsTools) noteToolResult(provider, model, false);
            if (failure.retryable) continue;
            return errorResponse(503, failure.message, failure.code, { "x-omniroute-provider": provider.id, "x-omniroute-model": model, "x-omniroute-attempt-trail": attemptTrailHeader(attemptTrail) });
          }
          const preflight = preflightStream(upstream.body);
          const streamFailure = await preflight.inspect();
          if (streamFailure) {
            await preflight.cancel().catch(() => undefined);
            const failure = toolCompatibleFailure(streamFailure, wantsTools, isAuto);
            await recordUsage(provider, model, "chat.completions", "failed", {}, policy, startedAt, dependencies);
            lastRetryableStatus = 503;
            lastFailureMessage = failure.message;
            lastFailureCode = failure.code;
            attemptTrail.push(`${model}:${failure.code}`);
            noteFailure(provider, model, 503);
            if (wantsTools) noteToolResult(provider, model, false);
            if (failure.retryable) continue;
            return errorResponse(503, failure.message, failure.code, { "x-omniroute-provider": provider.id, "x-omniroute-model": model, "x-omniroute-attempt-trail": attemptTrailHeader(attemptTrail) });
          }
          noteProviderSuccess(provider, model);
          applyUpstreamRateLimitHeaders(provider, model, upstream.headers);
          consumeRateLimit(provider, model);
          if (wantsTools) noteToolResult(provider, model, true);
          const sourceStream = toolWorkflow ? canonicalizeToolCallStream(preflight.stream, route) : preflight.stream;
          const stream = streamWithUsage(sourceStream, () => void recordUsage(provider, model, "chat.completions", "succeeded", {}, policy, startedAt, dependencies));
          const streamHeaders: Record<string, string> = { "content-type": upstream.headers.get("content-type") || "text/event-stream", "cache-control": "no-cache", "x-omniroute-provider": provider.id, "x-omniroute-model": model, "x-omniroute-routing-class": phase };
          if (toolWorkflow) {
            streamHeaders["x-omniroute-tool-protocol"] = OMNIROUTE_TOOL_PROTOCOL;
            streamHeaders[OMNIROUTE_TOOL_AFFINITY_HEADER] = encodeToolAffinity(route);
          }
          return new Response(stream, { status: upstream.status, headers: streamHeaders });
        }
        if (!upstream.ok) {
          const failure = toolCompatibleFailure(classifyUpstreamStatus(upstream.status) || { retryable: true, code: "provider_unavailable", message: "The upstream provider could not serve the request" }, wantsTools, isAuto);
          await recordUsage(provider, model, "chat.completions", "failed", {}, policy, startedAt, dependencies);
          lastRetryableStatus = upstream.status;
          attemptTrail.push(`${model}:${upstream.status}`);
          noteFailure(provider, model, upstream.status);
          if (wantsTools) noteToolResult(provider, model, false);
          lastFailureMessage = failure.message;
          lastFailureCode = failure.code;
          if (failure.retryable) continue;
          return errorResponse(503, failure.message, failure.code, { "x-omniroute-provider": provider.id, "x-omniroute-model": model, "x-omniroute-attempt-trail": attemptTrailHeader(attemptTrail) });
        }
        const responseBody = await upstream.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));
        const envelope = providerErrorEnvelope(responseBody, upstream.status);
        if (envelope) {
          const failure = toolCompatibleFailure(envelope.failure, wantsTools, isAuto);
          await recordUsage(provider, model, "chat.completions", "failed", {}, policy, startedAt, dependencies);
          lastRetryableStatus = envelope.status;
          lastFailureMessage = failure.message;
          lastFailureCode = failure.code;
          attemptTrail.push(`${model}:${envelope.status}`);
          noteFailure(provider, model, envelope.status);
          if (wantsTools) noteToolResult(provider, model, false);
          if (failure.retryable) continue;
          return errorResponse(503, failure.message, failure.code, { "x-omniroute-provider": provider.id, "x-omniroute-model": model, "x-omniroute-attempt-trail": attemptTrailHeader(attemptTrail) });
        }
        const normalizedResponseBody = normalizeChatToolResponse(responseBody, toolWorkflow ? route : null);
        await recordUsage(provider, model, "chat.completions", "succeeded", normalizedResponseBody, policy, startedAt, dependencies);
        const responseHeaders: Record<string, string> = { "x-omniroute-provider": provider.id, "x-omniroute-model": model, "x-omniroute-routing-class": phase };
        if (floored.applied) responseHeaders["x-omniroute-max-tokens-floor"] = String(floored.applied);
        if (toolWorkflow) {
          responseHeaders["x-omniroute-tool-protocol"] = OMNIROUTE_TOOL_PROTOCOL;
          responseHeaders[OMNIROUTE_TOOL_AFFINITY_HEADER] = encodeToolAffinity(route);
        }
        const response = jsonResponse(normalizedResponseBody, upstream.status, responseHeaders);
        if ((isAuto || floored.applied) && !hasUsableAssistantText(normalizedResponseBody, wantsTools)) {
          lastRetryableStatus = 502;
          lastFailureMessage = "The upstream provider returned a completion with no readable text";
          lastFailureCode = "provider_empty_completion";
          attemptTrail.push(`${model}:502`);
          noteFailure(provider, model, 502);
          if (wantsTools) noteToolResult(provider, model, false);
          continue;
        }
        noteProviderSuccess(provider, model);
        applyUpstreamRateLimitHeaders(provider, model, upstream.headers);
        const usage = extractUsage(normalizedResponseBody);
        consumeRateLimit(provider, model, { inputTokens: usage.inputTokens ?? undefined, outputTokens: usage.outputTokens ?? undefined });
        if (wantsTools) noteToolResult(provider, model, true);
        return response;
      } catch (error) {
        const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
        await recordUsage(provider, model, "chat.completions", "failed", {}, policy, startedAt, dependencies);
        lastRetryableStatus = 408;
        lastFailureMessage = message;
        lastFailureCode = "provider_timeout";
        attemptTrail.push(`${model}:408`);
        noteFailure(provider, model, 408);
        if (wantsTools) noteToolResult(provider, model, false);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  return errorResponse(503, lastFailureMessage, lastFailureCode, { "retry-after": "5", "x-omniroute-failure-codes": lastRetryableStatus !== null ? String(lastRetryableStatus) : "unavailable", "x-omniroute-attempt-trail": attemptTrailHeader(attemptTrail) });
}
