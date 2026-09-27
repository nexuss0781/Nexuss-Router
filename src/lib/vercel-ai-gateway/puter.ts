// Puter has no OpenAI-compatible HTTP endpoint on a free plan: /puterai/openai/v1/*
// answers 402 subscription_required, and /drivers/call resolves drivers client-side so it
// is not callable over HTTP. The only path that works is the SDK, so this module runs
// puter.js server-side through init() and translates OpenAI chat-completions to
// puter.ai.chat() and back.
//
// The model ids are Puter's own, which are provider-qualified and colon-separated
// ("infron:qwen/qwen3.8-27b:free"). They are stored bare and qualified as
// "puter/<id>" in NAR, so the slash inside the id never reaches the routing prefix.
import { createRequire } from "node:module";
import { join } from "node:path";

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
  const entry = "@heyputer/puter.js/src/init.cjs";
  const attempts: Array<() => string> = [
    () => require.resolve(entry, { paths: [process.cwd()] }),
    () => createRequire(import.meta.url).resolve(entry),
    () => createRequire(join(process.cwd(), "package.json")).resolve(entry),
  ];
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      const resolved = attempt();
      const loaded = createRequire(resolved)(resolved) as PuterInit;
      if (typeof loaded?.init === "function") return loaded;
      failures.push(`${resolved} did not export init()`);
    } catch (error) {
      failures.push(`${describePuterError(error)}`);
    }
  }
  throw new Error(`Unable to load @heyputer/puter.js: ${failures.join(" | ").slice(0, 300)}`);
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

function sseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function toStream(model: string, text: string, usage: Record<string, unknown>): Response {
  const base = {
    id: `chatcmpl-puter-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
  };
  const first = sseChunk({ ...base, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] });
  const content = sseChunk({ ...base, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
  const last = sseChunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage });
  return new Response(`${first}${content}${last}data: [DONE]\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

function toJson(model: string, text: string, usage: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      id: `chatcmpl-puter-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
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

    const result = await puter.ai.chat(flattenMessages(messages), options);
    const text = contentToText(result?.message?.content ?? result?.text ?? "");
    const usage = usageFrom(result);
    return stream ? toStream(model, text, usage) : toJson(model, text, usage);
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
