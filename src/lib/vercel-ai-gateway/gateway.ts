import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { ParadRequestDependencies } from "@/lib/vercel-parad/index.ts";
import { getAiModelMetadata, listAiModelIds } from "./modelMetadata";
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
    id: "opencode-zen",
    baseUrl: "https://opencode.ai/zen/v1",
    apiKey: "",
    format: "openai",
    priority: 1000,
    models: [
      "big-pickle",
      "deepseek-v4-flash-free",
      "mimo-v2.5-free",
      "hy3-free",
      "nemotron-3-ultra-free",
      "nemotron-3.5-lightning-free",
      "laguna-s-2.1-free",
    ],
  },
  {
    id: "pollinations",
    baseUrl: "https://gen.pollinations.ai/v1",
    apiKey: "",
    format: "openai",
    priority: 990,
    models: [
      "openai-fast",
      "openai-large",
      "qwen-coder",
      "mistral",
      "deepseek",
      "grok",
      "gemini-flash-lite-3.1",
      "perplexity-fast",
      "perplexity-reasoning",
    ],
  },
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
    id: "g4f-pollinations",
    baseUrl: "https://g4f.space/v1",
    apiKey: "",
    format: "openai",
    priority: 970,
    models: ["openai", "openai-fast"],
  },
];

// G4F can list routes that remain account- or provider-gated at completion time.
// Retain private configuration for future restoration, but do not discover, expose, or route through it.
const DISABLED_PROVIDER_IDS = new Set(["g4f-pollinations"]);

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
    providerId: "opencode-zen",
    apiKeyNames: ["OMNIROUTE_OPENCODE_ZEN_API_KEY", "OPENCODE_ZEN_API_KEY", "OPENCODE_API_KEY"],
    baseUrlNames: ["OMNIROUTE_OPENCODE_ZEN_BASE_URL", "OPENCODE_ZEN_BASE_URL", "OPENCODE_BASE_URL"],
    modelsNames: ["OMNIROUTE_OPENCODE_ZEN_MODELS", "OPENCODE_ZEN_MODELS", "OPENCODE_MODELS"],
  },
  {
    providerId: "pollinations",
    apiKeyNames: ["OMNIROUTE_POLLINATIONS_API_KEY", "POLLINATIONS_API_KEY"],
    baseUrlNames: ["OMNIROUTE_POLLINATIONS_BASE_URL", "POLLINATIONS_BASE_URL"],
    modelsNames: ["OMNIROUTE_POLLINATIONS_MODELS", "POLLINATIONS_MODELS"],
  },
  {
    providerId: "kilo-gateway",
    apiKeyNames: ["OMNIROUTE_KILO_API_KEY", "KILO_GATEWAY_API_KEY", "KILO_API_KEY"],
    baseUrlNames: ["OMNIROUTE_KILO_BASE_URL", "KILO_GATEWAY_BASE_URL", "KILO_BASE_URL"],
    modelsNames: ["OMNIROUTE_KILO_MODELS", "KILO_GATEWAY_MODELS", "KILO_MODELS"],
  },
  {
    providerId: "g4f-pollinations",
    apiKeyNames: ["OMNIROUTE_G4F_API_KEY", "G4F_POLLINATIONS_API_KEY", "G4F_API_KEY"],
    baseUrlNames: ["OMNIROUTE_G4F_BASE_URL", "G4F_POLLINATIONS_BASE_URL", "G4F_BASE_URL"],
    modelsNames: ["OMNIROUTE_G4F_MODELS", "G4F_POLLINATIONS_MODELS", "G4F_MODELS"],
  },
];

async function discoverG4fModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!Array.isArray(payload?.data)) return [];
    return payload.data
      .map((item) => typeof item === "string" ? item : (item && typeof item === "object" && "id" in item && typeof item.id === "string" ? item.id : ""))
      .filter(Boolean)
      .slice(0, 1_000);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function envConfiguredBuiltinProviders(): Promise<AiProvider[]> {
  const providers = await Promise.all(BUILTIN_PROVIDER_ENV.filter((mapping) => !DISABLED_PROVIDER_IDS.has(mapping.providerId)).map(async (mapping) => {
    const builtin = BUILTIN_OPTIONAL_PROVIDERS.find((provider) => provider.id === mapping.providerId);
    const apiKey = firstEnv(...mapping.apiKeyNames);
    if (!builtin || !apiKey) return null;
    const baseUrl = (firstEnv(...mapping.baseUrlNames) || builtin.baseUrl).replace(/\/+$/, "");
    const configuredModels = parseModels(firstEnv(...mapping.modelsNames));
    const discoveredModels = mapping.providerId === "g4f-pollinations" && !configuredModels.length
      ? await discoverG4fModels(baseUrl, apiKey)
      : [];
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
  const records = await listProviderConnections(dependencies);
  const configured = records.map(providerFromRecord).filter((provider) => provider.baseUrl && (provider.apiKey || provider.id === "none"));
  const fallback = envProvider();
  const envBuiltins = await envConfiguredBuiltinProviders();
  const configuredIds = new Set(configured.map((provider) => provider.id));
  const builtins = BUILTIN_OPTIONAL_PROVIDERS.filter((provider) => !DISABLED_PROVIDER_IDS.has(provider.id) && (provider.id === "opencode-zen" || !configuredIds.has(provider.id)));
  const all = [...configured, ...(fallback ? [fallback] : []), ...envBuiltins, ...builtins].map((provider) => {
    if (provider.id !== "g4f-pollinations") return provider;
    const taxonomyModels = listAiModelIds(provider.id).map((id) => id.slice(provider.id.length + 1));
    return { ...provider, models: Array.from(new Set([...provider.models, ...taxonomyModels])) };
  });
  const deduped = all
    .filter((provider) => !DISABLED_PROVIDER_IDS.has(provider.id))
    .filter((provider, index, values) => values.findIndex((candidate) => candidate.id === provider.id && candidate.baseUrl === provider.baseUrl && Boolean(candidate.apiKey) === Boolean(provider.apiKey)) === index);
  return deduped.sort((left, right) => (left.priority - right.priority));
}

function isExcludedModel(providerId: string, model: string): boolean {
  return providerId === "pollinations" && (model === "openai" || model === "pollinations/openai");
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

  const policies = await listApiKeyPolicies(dependencies);
  const policy = policies.find((candidate) => constantTimeEqual(candidate.keyHash, hashApiKey(supplied)));
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
  await recordAiUsageEvent({
    id: randomUUID(),
    apiKeyId: policy?.id ?? null,
    providerId: provider.id,
    model,
    endpoint,
    status,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
  }, dependencies).catch(() => undefined);
}

export async function getAiOnlyModels(request: Request, dependencies: ParadRequestDependencies = {}) {
  const { response } = await authenticateGatewayRequest(request, dependencies);
  if (response) return response;
  const providers = await listProviders(dependencies);
  const overrides = await listModelOverrides(dependencies);
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
  if (provider.id === "opencode-zen") {
    headers["user-agent"] = process.env.OPENCODE_USER_AGENT?.trim() || "opencode";
    headers["x-opencode-client"] = process.env.OPENCODE_CLIENT?.trim() || "desktop";
    headers["x-opencode-project"] = process.env.OPENCODE_PROJECT?.trim() || "global";
    headers["x-opencode-request"] = randomUUID();
    headers["x-opencode-session"] = randomUUID();
  }
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
  const provider = options.providerId ? providers.find((candidate) => candidate.id === options.providerId) : selectProvider(providers, model);
  if (!provider) return errorResponse(503, options.providerId ? `No configured provider ${options.providerId}` : `No configured provider can serve model ${model}`, "provider_unavailable");
  if (options.providerId && model !== "auto" && model.includes("/")) {
    const prefix = model.split("/", 1)[0];
    if (prefix !== provider.id) return errorResponse(400, `Model "${model}" does not belong to provider "${provider.id}"`, "model_provider_mismatch");
  }
  const upstreamModel = model === "auto" ? model : providerModel(model, provider);
  const upstreamBody = model === "auto" || typeof body.model !== "string" ? body : { ...body, model: upstreamModel };
  const upstreamPath = (options.upstreamPath || endpoint).replace(/^\/+|\/+$/g, "");
  const upstreamUrl = `${provider.baseUrl}/${upstreamPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const upstream = await fetch(upstreamUrl, { method: "POST", headers: upstreamHeaders(provider), body: JSON.stringify(upstreamBody), signal: controller.signal });
    if (options.streamResponse || body.stream === true) return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "text/event-stream", "cache-control": "no-cache", "x-omniroute-provider": provider.id } });
    if (options.binaryResponse) {
      const bytes = await upstream.arrayBuffer();
      await recordUsage(provider, model, options.endpointName || endpoint, upstream.ok ? "succeeded" : "failed", {}, policy, startedAt, dependencies);
      return new Response(bytes, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/octet-stream", "x-omniroute-provider": provider.id } });
    }
    const responseBody = await upstream.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));
    await recordUsage(provider, model, options.endpointName || endpoint, upstream.ok ? "succeeded" : "failed", responseBody, policy, startedAt, dependencies);
    return jsonResponse(responseBody, upstream.status, { "x-omniroute-provider": provider.id });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
    await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
    return errorResponse(504, message, "provider_timeout");
  } finally {
    clearTimeout(timeout);
  }
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
  const provider = options.providerId ? providers.find((candidate) => candidate.id === options.providerId) : selectProvider(providers, model);
  if (!provider) return errorResponse(503, options.providerId ? `No configured provider ${options.providerId}` : `No configured provider can serve model ${model}`, "provider_unavailable");
  const upstreamPath = (options.upstreamPath || endpoint).replace(/^\/+|\/+$/g, "");
  const upstreamUrl = `${provider.baseUrl}/${upstreamPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const upstream = await fetch(upstreamUrl, { method: "POST", headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}, body: form, signal: controller.signal });
    const responseBody = await upstream.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));
    await recordUsage(provider, model, options.endpointName || endpoint, upstream.ok ? "succeeded" : "failed", responseBody, policy, startedAt, dependencies);
    return jsonResponse(responseBody, upstream.status, { "x-omniroute-provider": provider.id });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
    await recordUsage(provider, model, options.endpointName || endpoint, "failed", {}, policy, startedAt, dependencies);
    return errorResponse(504, message, "provider_timeout");
  } finally {
    clearTimeout(timeout);
  }
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

const OPEN_CODE_AUTO_FALLBACKS = [
  "big-pickle",
  "mimo-v2.5-free",
  "nemotron-3-ultra-free",
  "nemotron-3.5-lightning-free",
  "deepseek-v4-flash-free",
  "laguna-s-2.1-free",
  "hy3-free",
];
const MAX_AUTO_SECONDARY_CANDIDATES = 8;
const ROUTE_COOLDOWN_MS = 30_000;
const PROVIDER_COOLDOWN_MS = 10_000;
const routeCooldowns = new Map<string, number>();

// Verified by a live greeting audit on 2026-08-26. Automatic routing is intentionally
// restricted to successful inventory entries; explicit requests retain their exact-model behavior.
const VERIFIED_AUTO_INVENTORY = [
  "kilo-gateway/nvidia/nemotron-3-super-120b-a12b:free",
  "opencode-zen/nemotron-3-ultra-free",
  "kilo-gateway/kilo-auto/free",
  "opencode-zen/nemotron-3.5-lightning-free",
  "opencode-zen/laguna-s-2.1-free",
] as const;

function canonicalProviderModel(provider: AiProvider, model: string): string {
  return model.startsWith(`${provider.id}/`) ? model : `${provider.id}/${model}`;
}

function providerRouteKey(provider: AiProvider): string {
  return `${provider.id}|${provider.baseUrl}|${provider.apiKey ? "keyed" : "keyless"}`;
}

function modelRouteKey(provider: AiProvider, model: string): string {
  return `${providerRouteKey(provider)}|${model}`;
}

function isProviderCoolingDown(provider: AiProvider, model: string): boolean {
  const now = Date.now();
  const providerUntil = routeCooldowns.get(providerRouteKey(provider)) || 0;
  const modelUntil = routeCooldowns.get(modelRouteKey(provider, model)) || 0;
  return providerUntil > now || modelUntil > now;
}

function noteProviderFailure(provider: AiProvider, model: string, status: number): void {
  const now = Date.now();
  if (status === 429) {
    routeCooldowns.set(modelRouteKey(provider, model), now + ROUTE_COOLDOWN_MS);
    return;
  }
  if (status === 401 || status === 402 || status === 403 || status === 408 || status >= 500) {
    routeCooldowns.set(providerRouteKey(provider), now + PROVIDER_COOLDOWN_MS);
  }
}

function autoModelScore(provider: AiProvider, model: string): number {
  const metadata = getAiModelMetadata(model, provider.id);
  if (!["text-chat", "text-chat-vision-candidate"].includes(metadata.modality)) return Number.NEGATIVE_INFINITY;
  const source = model.slice(`${provider.id}/`.length).toLowerCase();
  if (source === "auto" || source.includes("auto/free")) return Number.NEGATIVE_INFINITY;
  let score = provider.id === "opencode-zen" ? 6_000 : provider.id === "kilo-gateway" ? 4_000 : 2_000;
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

function autoModelCandidates(providers: AiProvider[], providerScope?: string): string[] {
  const inScope = (provider: AiProvider) => !providerScope || provider.id === providerScope;
  const scopedProviders = providers.filter(inScope);
  const inventory = VERIFIED_AUTO_INVENTORY.filter((model) => Boolean(selectProvider(scopedProviders, model)));
  const configured = parseModels(process.env.OMNIROUTE_AI_AUTO_MODELS || "");
  if (configured.length) return configured.filter((model, index, all) => all.indexOf(model) === index && inventory.includes(model as typeof inventory[number]));
  return inventory;
}

function isRetryableProviderStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 408 || status === 429 || status >= 500;
}

export async function handleAiOnlyChatCompletions(request: Request, dependencies: ParadRequestDependencies = {}) {
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

  const requestedModel = body.model?.trim() || "auto";
  const isProviderAuto = requestedModel.startsWith("auto/") && requestedModel !== "auto/free";
  const isAuto = requestedModel === "auto" || requestedModel === "auto/free" || isProviderAuto;
  const providerScope = isProviderAuto ? requestedModel.slice("auto/".length) : undefined;
  const policyFailure = policyAllows(policy, "chat.completions", requestedModel);
  if (policyFailure) return policyFailure;
  const providers = await listProviders(dependencies);
  const models = isAuto ? autoModelCandidates(providers, providerScope) : [requestedModel];
  if (!models.length) return errorResponse(503, "No currently available model can serve this request", "provider_unavailable");

  let lastResponse: Response | null = null;
  let lastRetryableStatus: number | null = null;
  for (const model of models) {
    const providerCandidates = selectProviders(providers, model);
    for (const provider of providerCandidates) {
      if (isProviderCoolingDown(provider, model)) continue;
      const upstreamModel = providerModel(model, provider);
      const endpoint = `${provider.baseUrl}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_TIMEOUT_MS);
      const startedAt = Date.now();
      try {
        const upstream = await fetch(endpoint, {
          method: "POST",
          headers: upstreamHeaders(provider),
          body: JSON.stringify({ ...body, model: upstreamModel }),
          signal: controller.signal,
        });
        if (body.stream === true && upstream.ok) {
          return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "text/event-stream", "cache-control": "no-cache", "x-omniroute-provider": provider.id, "x-omniroute-model": model } });
        }
        const responseBody = await upstream.json().catch(() => ({ error: { message: "Provider returned invalid JSON" } }));
        await recordUsage(provider, model, "chat.completions", upstream.ok ? "succeeded" : "failed", responseBody, policy, startedAt, dependencies);
        lastResponse = jsonResponse(responseBody, upstream.status, { "x-omniroute-provider": provider.id, "x-omniroute-model": model });
        if (upstream.ok || !isRetryableProviderStatus(upstream.status)) return lastResponse;
        lastRetryableStatus = upstream.status;
        noteProviderFailure(provider, model, upstream.status);
      } catch (error) {
        const message = error instanceof Error && error.name === "AbortError" ? "Provider request timed out" : "Provider request failed";
        await recordUsage(provider, model, "chat.completions", "failed", {}, policy, startedAt, dependencies);
        lastRetryableStatus = 408;
        noteProviderFailure(provider, model, 408);
        lastResponse = errorResponse(504, message, "provider_timeout");
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  if (isAuto && lastRetryableStatus !== null) {
    return errorResponse(503, "All automatic providers are temporarily unavailable; OmniRoute exhausted its fallback routes", "provider_pool_exhausted", { "retry-after": "5" });
  }
  return lastResponse || errorResponse(503, "No currently available model can serve this request", "provider_unavailable");
}
