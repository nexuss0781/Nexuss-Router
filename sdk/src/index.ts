/**
 * nar — minimal client for Nexuss AI Router.
 *
 * Zero dependencies: uses the platform fetch, so it runs on Node 18+, Bun, Deno,
 * Cloudflare Workers and Vercel Edge without a polyfill.
 *
 * The point of this wrapper is that a caller never assembles a URL, never picks a
 * provider, and never handles a provider outage. Pass "auto" (the default) and NAR
 * picks a healthy free model. Every call reports which model actually served it.
 */

export type ChatOptions = {
  /** Model id such as "auto", or a pinned id like "puter/infron:qwen/qwen3.8-27b:free". */
  model?: string;
  /** System prompt. Appended ahead of the user turn. */
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** OpenAI-style tool definitions, for tool-calling loops. */
  tools?: unknown[];
  /** Abort the request. */
  signal?: AbortSignal;
  /** Override the deployment for this call only. */
  baseUrl?: string;
  apiKey?: string;
  /** Extra body fields merged last, for anything this wrapper does not model. */
  extra?: Record<string, unknown>;
};

/** Which route actually served the request, read from NAR's response headers. */
export type Route = {
  provider: string | null;
  model: string | null;
  /** Providers that failed and were fallen through, when the request ultimately failed. */
  attemptTrail: string | null;
};

/** OpenAI-shaped token usage. Keys are the wire names, so it can be forwarded as-is. */
export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type ChatResult = {
  text: string;
  route: Route;
  /** Token usage, when the upstream reported it. Streaming responses usually omit it. */
  usage: Usage | null;
  /** Raw response envelope, for callers that need more than text. */
  raw: unknown;
};

export type StreamEvent = {
  /** Incremental text. Empty on role-only or tool-call-only chunks. */
  delta: string;
  /** Accumulated tool calls so far, keyed by index. */
  toolCalls: Record<number, { id?: string; name?: string; arguments: string }>;
  finishReason: string | null;
  route: Route;
};

export class NarError extends Error {
  readonly status: number;
  readonly code: string;
  readonly route: Route;
  readonly body: unknown;
  constructor(message: string, status: number, code: string, route: Route, body: unknown) {
    super(message);
    this.name = "NarError";
    this.status = status;
    this.code = code;
    this.route = route;
    this.body = body;
  }
}

const DEFAULT_MODEL = "auto";

function envBase(): string {
  const raw = process.env.NAR_BASE_URL || process.env.OMNIROUTE_BASE_URL || "https://omniouter-vercel.vercel.app";
  return raw.replace(/\/+$/, "");
}

function envKey(): string {
  const key = process.env.NAR_API_KEY || process.env.OMNIROUTE_AI_API_KEY || "";
  if (!key) {
    throw new NarError(
      "No master key. Set NAR_API_KEY (or OMNIROUTE_AI_API_KEY) to your NAR gateway key.",
      401,
      "missing_api_key",
      { provider: null, model: null, attemptTrail: null },
      null,
    );
  }
  return key;
}

function apiBase(override?: string): string {
  const base = (override || envBase()).replace(/\/+$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

function routeFrom(headers: Headers): Route {
  return {
    provider: headers.get("x-omniroute-provider"),
    model: headers.get("x-omniroute-model"),
    attemptTrail: headers.get("x-omniroute-attempt-trail"),
  };
}

function buildMessages(prompt: string, options: ChatOptions): unknown[] {
  const messages: unknown[] = [];
  if (options.system) messages.push({ role: "system", content: options.system });
  messages.push({ role: "user", content: prompt });
  return messages;
}

function buildBody(prompt: string, options: ChatOptions, stream: boolean): Record<string, unknown> {
  return {
    model: options.model || DEFAULT_MODEL,
    messages: buildMessages(prompt, options),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    ...(options.tools ? { tools: options.tools } : {}),
    ...(stream ? { stream: true } : {}),
    ...(options.extra ?? {}),
  };
}

async function readError(response: Response, route: Route): Promise<NarError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = (body ?? {}) as { error?: { message?: string; code?: string; type?: string } };
  const message = record.error?.message || `NAR request failed with status ${response.status}`;
  const code = record.error?.code || record.error?.type || `http_${response.status}`;
  return new NarError(message, response.status, code, route, body);
}

function mergeToolCalls(
  into: Record<number, { id?: string; name?: string; arguments: string }>,
  deltas: unknown,
): Record<number, { id?: string; name?: string; arguments: string }> {
  if (!Array.isArray(deltas)) return into;
  for (const call of deltas as Array<Record<string, any>>) {
    const index = typeof call.index === "number" ? call.index : 0;
    const existing = (into[index] ??= { arguments: "" });
    if (typeof call.id === "string" && call.id) existing.id = call.id;
    const fn = call.function as Record<string, unknown> | undefined;
    if (fn && typeof fn.name === "string") existing.name = fn.name;
    if (fn && typeof fn.arguments === "string") existing.arguments += fn.arguments;
  }
  return into;
}

function parseChunk(payload: string, route: Route, toolCalls: Record<number, { id?: string; name?: string; arguments: string }>): StreamEvent {
  try {
    const parsed = JSON.parse(payload) as Record<string, any>;
    const choice = parsed?.choices?.[0] ?? {};
    const delta = choice.delta ?? {};
    mergeToolCalls(toolCalls, delta.tool_calls);
    return {
      delta: typeof delta.content === "string" ? delta.content : "",
      toolCalls,
      finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
      route,
    };
  } catch {
    return { delta: "", toolCalls, finishReason: null, route };
  }
}

/**
 * Stream a chat completion as text deltas.
 *
 *   for await (const delta of nar.stream("explain pythons")) console.log(delta);
 *
 * Yields plain strings, so a caller that only wants the text never touches SSE.
 * Use streamEvents when tool calls are needed.
 */
export async function* stream(prompt: string, options: ChatOptions = {}): AsyncGenerator<string> {
  for await (const event of streamEvents(prompt, options)) {
    if (event.delta) yield event.delta;
  }
}

/** Same as stream(), but yields structured events including accumulated tool calls. */
export async function* streamEvents(prompt: string, options: ChatOptions = {}): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${apiBase(options.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey || envKey()}`,
    },
    body: JSON.stringify(buildBody(prompt, options, true)),
    signal: options.signal,
  });

  const route = routeFrom(response.headers);
  if (!response.ok) throw await readError(response, route);
  if (!response.body) throw new NarError("NAR returned an empty stream", 502, "empty_stream", route, null);

  // Network chunks do not align with SSE frame boundaries, so partial frames are held
  // in `buffer` until the next chunk supplies the rest of the line.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls: Record<number, { id?: string; name?: string; arguments: string }> = {};
  let buffer = "";
  let done = false;

  while (!done) {
    const { value, done: finished } = await reader.read();
    if (finished) {
      buffer += decoder.decode();
      done = true;
    } else {
      buffer += decoder.decode(value, { stream: true });
    }

    // Frames are separated by a blank line; a trailing partial frame stays in buffer.
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const payload = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (payload && payload !== "[DONE]") yield parseChunk(payload, route, toolCalls);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

/** Collect a full streamed answer. Convenient when streaming is not needed downstream. */
export async function chat(prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
  let text = "";
  let route: Route = { provider: null, model: null, attemptTrail: null };
  for await (const event of streamEvents(prompt, options)) {
    text += event.delta;
    route = event.route;
  }
  return { text, route, usage: null, raw: null };
}

/** One non-streaming request, returning the parsed OpenAI-shaped envelope. */
export async function complete(prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
  const response = await fetch(`${apiBase(options.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey || envKey()}`,
    },
    body: JSON.stringify(buildBody(prompt, options, false)),
    signal: options.signal,
  });

  const route = routeFrom(response.headers);
  if (!response.ok) throw await readError(response, route);

  const body = (await response.json()) as Record<string, any>;
  return {
    text: body?.choices?.[0]?.message?.content ?? "",
    route,
    usage: body?.usage ?? null,
    raw: body,
  };
}

/** List live models. Pass this to a user or an agent to see what is actually available. */
export async function models(options: { baseUrl?: string; apiKey?: string; signal?: AbortSignal } = {}): Promise<string[]> {
  const response = await fetch(`${apiBase(options.baseUrl)}/models`, {
    headers: { authorization: `Bearer ${options.apiKey || envKey()}` },
    signal: options.signal,
  });
  const route = routeFrom(response.headers);
  if (!response.ok) throw await readError(response, route);
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? []).map((entry) => String(entry.id)).filter(Boolean);
}

export type HealthReport = {
  status: string;
  ready: boolean;
  checks: Array<{ name: string; status: string; detail: string }>;
};

/** Router health, including per-provider auth state. Useful for uptime checks. */
export async function health(options: { baseUrl?: string; signal?: AbortSignal } = {}): Promise<HealthReport> {
  const response = await fetch(`${envBase().replace(/\/+$/, "")}/api/v1/health`, { signal: options.signal });
  return (await response.json()) as HealthReport;
}

export const nar = { stream, streamEvents, chat, complete, models, health };
export default nar;
