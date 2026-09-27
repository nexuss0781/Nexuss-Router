// Puter has no OpenAI-compatible HTTP endpoint on a free plan: /puterai/openai/v1/*
// answers 402 subscription_required, and /drivers/call resolves drivers client-side so it
// is not callable over HTTP. The only path that works is the SDK, so this module runs
// puter.js server-side through init() and translates OpenAI chat-completions to
// puter.ai.chat() and back.
//
// The model ids are Puter's own, which are provider-qualified and colon-separated
// ("infron:qwen/qwen3.8-27b:free"). They are stored bare and qualified as
// "puter/<id>" in NAR, so the slash inside the id never reaches the routing prefix.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";

export const PUTER_PROVIDER_ID = "puter";
export const PUTER_API_ORIGIN = "https://api.puter.com";

// Free-tier rows only: costs are zero at the model level, confirmed by usd_cents=0 on
// live calls. The 21 openrouter:* free rows are omitted on purpose - NAR already has a
// direct OpenRouter provider, and routing them through Puter would double-relay them.
export const PUTER_MODELS = [
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
  "infron:qwen/qwen3.8-27b:free",
  "infron:deepseek/deepseek-v4-flash:free",
  "infron:deepseek/deepseek-v4.1-flash:free",
  "infron:deepseek/deepseek-v4-flash-0731:free",
  "infron:motif/motif-3",
];

// Documented free tier is 30 requests / 10s and 3 concurrent per interface+method.
// Measured: 25 simultaneous calls all succeeded, 30 at once started failing, and 40 at
// once returned 10 ok / 30 x 429. Concurrency is the real ceiling, so it is enforced
// here; the published per-10s window is left to rate-limit.ts.
const PUTER_MAX_CONCURRENCY = 4;

type PuterInstance = {
  ai: { chat: (prompt: unknown, options?: Record<string, unknown>) => Promise<PuterChatResult> };
};

type PuterChatResult = {
  message?: { content?: unknown; tool_calls?: unknown[] };
  text?: string;
  usage?: { prompt?: number; completion?: number; usd_cents?: number };
};

let instance: PuterInstance | null = null;
let instanceToken = "";
let inflight = 0;
const waiters: (() => void)[] = [];

export function puterApiKey(): string {
  return firstEnv("OMNIROUTE_PUTER_TOKEN", "OMNIROUTE_PUTER_API_KEY", "PUTER_AUTH_TOKEN", "puterAuthToken");
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

async function acquire(): Promise<void> {
  if (inflight < PUTER_MAX_CONCURRENCY) {
    inflight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inflight += 1;
}

function release(): void {
  inflight -= 1;
  waiters.shift()?.();
}

// init() reads a browser bundle and evaluates it in a node:vm context, so it is lazy
// and cached per token: it is expensive and must not run per request.
//
// init.cjs locates that bundle via resolve(__filename, '..') + '/../dist', so the
// package must be required by its real on-disk path. createRequire(import.meta.url)
// resolves against the *emitted server chunk* under a bundler, which is what made the
// deployed function report "bundle not found" even though dist/puter.cjs ships in the
// npm package. Resolving the entry from the project root first keeps this correct
// regardless of how the module got bundled, and the createRequire path stays as a
// fallback for non-standard layouts.
function getInstance(token: string): PuterInstance {
  if (instance && instanceToken === token) return instance;
  const { init } = loadInit();
  instance = init(token) as PuterInstance;
  instanceToken = token;
  return instance;
}

type PuterInit = { init: (token: string) => unknown };

function loadInit(): PuterInit {
  // init() is reimplemented here rather than required from init.cjs, because init.cjs
  // finds its bundle with resolve(__filename, '..') + '/../dist'. Under a bundler
  // __filename is the emitted chunk, so that lookup misses and the SDK reports
  // "run npm run build in src/puter-js first" - misleading, since the bundle ships in the
  // npm package. Resolving dist/puter.cjs by package path relies on the
  // outputFileTracingIncludes entry in next.config.mjs instead, which is verifiable in
  // the route's .nft.json.
  const entry = "@heyputer/puter.js/dist/puter.cjs";
  // Only createRequire is used here. A bare require.resolve is whatever the bundler
  // leaves in scope, which is not Node's require and does not honour the paths option.
  const anchors = [join(process.cwd(), "package.json"), import.meta.url];
  const failures: string[] = [];
  for (const anchor of anchors) {
    try {
      const requireFrom = createRequire(anchor);
      const bundlePath = requireFrom.resolve(entry);
      const code = readFileSync(bundlePath, "utf8");
      return { init: (token: string) => evaluatePuterBundle(code, token) };
    } catch (error) {
      failures.push(describePuterError(error));
    }
  }
  throw new Error(`Unable to load @heyputer/puter.js: ${failures.join(" | ").slice(0, 300)}`);
}

// Mirrors init.cjs: hand the browser bundle a vm context seeded with the host globals,
// because it is written to run against window/document rather than a server.
function evaluatePuterBundle(code: string, token: string): unknown {
  const goodContext: Record<string, unknown> = {
    PUTER_API_ORIGIN: globalThis.PUTER_API_ORIGIN,
    PUTER_ORIGIN: globalThis.PUTER_ORIGIN,
  };
  for (const name of Object.getOwnPropertyNames(globalThis)) {
    try {
      goodContext[name] = (globalThis as unknown as Record<string, unknown>)[name];
    } catch {
      continue;
    }
  }
  goodContext.globalThis = goodContext;
  const context = vm.createContext(goodContext);
  vm.runInNewContext(code, context);
  const puter = goodContext.puter as { setAuthToken?: (value: string) => void } | undefined;
  if (!puter?.setAuthToken) throw new Error("@heyputer/puter.js bundle did not expose puter.setAuthToken");
  puter.setAuthToken(token);
  return puter;
}

function toChatMessages(body: Record<string, unknown>): unknown {
  if (Array.isArray(body.messages) && body.messages.length > 0) return body.messages;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  return [{ role: "user", content: prompt }];
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const record = part as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
        if (typeof record.thinking === "string") return record.thinking;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function normalizeToolCalls(toolCalls: unknown): unknown[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.filter((call) => call && typeof call === "object");
}

// puter.ai.chat() takes a single prompt, so the message array is flattened and the
// conversation is replayed as text. Tool results are appended so multi-turn tool
// workflows still reach the model with their observations.
function flattenMessages(messages: unknown): string {
  if (!Array.isArray(messages)) return String(messages ?? "");
  const parts: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    const role = typeof record.role === "string" ? record.role : "user";
    const text = contentToText(record.content);
    if (text) parts.push(`${role}: ${text}`);
    for (const call of normalizeToolCalls(record.tool_calls)) {
      const callRecord = call as Record<string, unknown>;
      const fn = callRecord.function as Record<string, unknown> | undefined;
      if (fn && typeof fn.name === "string") {
        parts.push(`assistant: called ${fn.name}(${typeof fn.arguments === "string" ? fn.arguments : ""})`);
      }
    }
  }
  return parts.join("\n");
}

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// Puter returns tool calls already close to the OpenAI shape, but arguments can arrive as
// an object and some models attach extra_content, so each field is normalised explicitly
// rather than passed through.
function toOpenAiToolCalls(result: PuterChatResult): OpenAiToolCall[] {
  const raw = result?.message?.tool_calls;
  if (!Array.isArray(raw)) return [];
  const out: OpenAiToolCall[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const call = entry as Record<string, any>;
    const fn = (call.function ?? {}) as Record<string, any>;
    const name = typeof fn.name === "string" ? fn.name : typeof call.name === "string" ? call.name : "";
    if (!name) continue;
    const args = fn.arguments ?? call.arguments;
    out.push({
      id: typeof call.id === "string" && call.id ? call.id : `call_puter_${out.length}`,
      type: "function",
      function: {
        name,
        arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
      },
    });
  }
  return out;
}

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

// Puter's streaming mode does not expose usable per-token tool-call deltas, so a tool
// turn is emitted as a single complete delta. That is still a valid OpenAI stream and
// keeps a tool loop correct, which matters because NAR pins a tool conversation to the
// provider that started it.
function toStream(model: string, text: string, usage: Record<string, unknown>, toolCalls: OpenAiToolCall[] = []): Response {
  const base = {
    id: `chatcmpl-puter-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  };
  const first = sseChunk({ ...base, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
  const body = toolCalls.length > 0
    ? sseChunk({ ...base, choices: [{ index: 0, delta: { tool_calls: toolCalls.map((call, index) => ({ index, ...call })) }, finish_reason: null }] })
    : text
      ? sseChunk({ ...base, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })
      : "";
  const last = sseChunk({
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop" }],
    usage,
  });
  return new Response(`${first}${body}${last}data: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

function toJson(model: string, text: string, usage: Record<string, unknown>, toolCalls: OpenAiToolCall[] = []): Response {
  return new Response(
    JSON.stringify({
      id: `chatcmpl-puter-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: text, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) },
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
      }],
      usage,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function usageFrom(result: PuterChatResult): Record<string, unknown> {
  const usage = result.usage ?? {};
  const promptTokens = usage.prompt ?? 0;
  const completionTokens = usage.completion ?? 0;
  const total = promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: total,
    // Puter reports per-call metering even on zero-cost models; kept as a non-standard
    // field so it stays visible for cost auditing without breaking strict clients.
    ...(typeof usage.usd_cents === "number" ? { "x-puter-usd-cents": usage.usd_cents } : {}),
  };
}

// Returns a Response in the same shape as the OpenAI-compatible upstreams NAR already
// handles, so the gateway's streaming, tool-canonicalisation and usage paths are reused
// unchanged. A thrown error is mapped to a status the gateway can classify and retry.
export async function puterChatCompletion(
  body: Record<string, unknown>,
  model: string,
  signal?: AbortSignal,
): Promise<Response> {
  const token = puterApiKey();
  if (!token) {
    return new Response(JSON.stringify({ error: { message: "Puter token is not configured", type: "invalid_request_error" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  await acquire();
  try {
    if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    const puter = getInstance(token);
    const messages = toChatMessages(body);
    const stream = body.stream === true;
    const options: Record<string, unknown> = { model, stream };
    const maxTokens = typeof body.max_tokens === "number"
      ? body.max_tokens
      : typeof body.max_completion_tokens === "number"
        ? body.max_completion_tokens
        : undefined;
    if (typeof maxTokens === "number" && maxTokens > 0) options.max_tokens = maxTokens;
    if (typeof body.temperature === "number") options.temperature = body.temperature;
    if (typeof body.top_p === "number") options.top_p = body.top_p;
    // Puter handles tools natively, so the schema is forwarded rather than baked into the
    // prompt text. Verified: both gemma-4-26b-a4b-it and infron:qwen/qwen3.8-27b:free
    // return a real tool_calls array when tools are present. Without this the model gets
    // no schema, answers in prose, and a tool loop silently makes no progress.
    if (Array.isArray(body.tools) && body.tools.length > 0) options.tools = body.tools;
    if (typeof body.tool_choice === "string" || (body.tool_choice && typeof body.tool_choice === "object")) {
      options.tool_choice = body.tool_choice;
    }

    const result = await puter.ai.chat(flattenMessages(messages), options);
    const toolCalls = toOpenAiToolCalls(result);
    const text = toolCalls.length > 0 ? "" : contentToText(result?.message?.content ?? result?.text ?? "");
    const usage = usageFrom(result);
    return stream ? toStream(model, text, usage, toolCalls) : toJson(model, text, usage, toolCalls);
  } catch (error) {
    const message = describePuterError(error);
    const aborted = /abort/i.test(message);
    const rateLimited = /too many requests|429|rate limit/i.test(message);
    const noFunds = /insufficient|402|subscription|required/i.test(message);
    const status = aborted ? 499 : rateLimited ? 429 : noFunds ? 402 : 502;
    return new Response(
      JSON.stringify({ error: { message: message.slice(0, 300), type: rateLimited ? "rate_limit_error" : "server_error" } }),
      { status, headers: { "content-type": "application/json" } },
    );
  } finally {
    release();
  }
}

// puter.js rejects with an AbortSignal-shaped EventTarget on abort and with plain
// objects elsewhere, so a bare `error.message` yields "[object EventTarget]" and hides
// the real reason. Pull a usable string out of whatever shape arrived.
function describePuterError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "msg", "error", "detail", "reason"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    const type = typeof record.type === "string" ? record.type : undefined;
    if (type) return `puter rejection (${type})`;
    if (record.name === "AbortError" || "aborted" in record) return "AbortError: aborted";
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

// The SDK resolves its own origin internally and ignores a base-URL override, so this is
// the fixed, truthful value rather than a configurable knob. It exists only because
// AiProvider.baseUrl is required, and provider registration filters on it being non-empty.
export function puterBaseUrl(): string {
  return PUTER_API_ORIGIN;
}

// Health probe. The token is a session JWT with no exp claim, so signing out of Puter
// kills it and every call starts returning 401 - which the gateway classifies as
// retryable and silently routes around, leaving the provider registered but dead. There
// is no plain HTTP endpoint that validates the token (the SDK resolves auth through
// driver calls), so the only real check is a live call, on a zero-cost model with a
// single output token.
//
// Cached for PROBE_TTL_MS because init() evaluates the puter.js bundle and costs seconds
// on a cold lambda, and because the health endpoint is polled. Being in-memory it is
// still per-instance, so this buys per-lambda coverage rather than a global guarantee.
const PROBE_TTL_MS = 5 * 60 * 1000;
const PROBE_MODEL = "gemma-4-26b-a4b-it";
let probeCache: { at: number; result: PuterAuthState } | null = null;

export type PuterAuthState = {
  state: "ok" | "rejected" | "unreachable" | "unconfigured";
  detail: string;
  checkedAt: number;
};

export async function probePuterAuth(force = false): Promise<PuterAuthState> {
  const now = Date.now();
  if (!force && probeCache && now - probeCache.at < PROBE_TTL_MS) return probeCache.result;
  const result = await runProbe();
  probeCache = { at: now, result };
  return result;
}

async function runProbe(): Promise<PuterAuthState> {
  const checkedAt = Date.now();
  const token = puterApiKey();
  if (!token) return { state: "unconfigured", detail: "no token in env", checkedAt };
  try {
    const puter = getInstance(token);
    await puter.ai.chat("ping", { model: PROBE_MODEL, max_tokens: 1 });
    return { state: "ok", detail: `token accepted by ${PROBE_MODEL}`, checkedAt };
  } catch (error) {
    const message = describePuterError(error);
    const state = classifyPuterProbeError(message);
    return { state, detail: message.slice(0, 160), checkedAt };
  }
}

// Only an explicit credentials rejection counts as a dead token. A network or 5xx
// failure says nothing about the token, and reporting it as rejected would send someone
// hunting a rotated credential that never expired. Exported so this branch is testable
// without having to actually cut the network.
export function classifyPuterProbeError(message: string): "rejected" | "unreachable" {
  const rejected = /unauthor|forbidden|401|403|invalid token|token.*(expired|invalid)|auth/i.test(message);
  return rejected ? "rejected" : "unreachable";
}
