---
name: nexuss-ai-router
description: Use Nexuss AI Router (NAR) as the single AI inference endpoint, via the @nexuss0781/nar npm SDK or raw HTTP. Apply when an agent needs LLM inference, model discovery, Auto routing, SSE streaming, or tool-calling loops, and when the task mentions @nexuss0781/nar, NAR_API_KEY, NAR_BASE_URL, OMNIROUTE_AI_API_KEY, omniroute, x-omniroute-provider, or a Nexuss AI Router deployment.
---

# Nexuss AI Router (NAR) — AI Inference

NAR is one endpoint in front of several free model providers. You send a normal
OpenAI-shaped request; NAR picks a healthy free model, fails over to another when
one is busy or rate-limited, and tells you which route served the call.

**Prefer the SDK.** It handles model discovery, failover, SSE parsing, and tool-call
assembly. Drop to raw HTTP only for the endpoints the SDK does not wrap
(embeddings, images, audio, jobs, search).

## Decision rules

Read this first, then act. Do not explore providers directly.

| Situation | Do this |
| --- | --- |
| Any chat/completion request | Use the SDK. Never call a provider directly. |
| User did not name a model | `model: "auto"` |
| User named a model you have not seen this session | `await models()` first, then use that exact id |
| Need one specific provider family | `model: "auto/<provider>"` |
| Need the tool loop | `chat(prompt, { tools })`, read `r.finishReason` |
| First token speed matters | `extra: { routing_class: "agent-fast" }` |
| Slow provider startup is fine, quality matters | `extra: { routing_class: "quality" }` |
| Embeddings, images, audio, search, jobs | Raw HTTP against the endpoint table below |
| Report or audit which model answered | `r.route.provider`, `r.route.model` |
| All routes busy | NAR returns 503 `provider_unavailable`; do not retry more than twice |

## 1. Set up

```bash
npm install @nexuss0781/nar
```

Zero dependencies, Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge.

```bash
export NAR_BASE_URL="https://omniouter-vercel.vercel.app"   # optional, this is the default
export NAR_API_KEY="<master key>"                          # required
```

`NAR_API_KEY` falls back to `OMNIROUTE_AI_API_KEY`. The client resolves, in order:
`options.apiKey` → `NAR_API_KEY` → `OMNIROUTE_AI_API_KEY` → throws `NarError` 401
`missing_api_key`. Never hardcode a key; always read the environment.

For your own deployment, `NAR_BASE_URL` may be any host, with or without a trailing
`/api/v1`. The client appends `/api/v1` when it is missing.

## 2. The six calls

| Call | Returns | Use for |
| --- | --- | --- |
| `stream(prompt, opts)` | `AsyncGenerator<string>` of text deltas | Showing text as it arrives |
| `streamEvents(prompt, opts)` | `AsyncGenerator<StreamEvent>` | Streaming you also need tool calls from |
| `chat(prompt, opts)` | `ChatResult` | The normal choice. Full text, no streaming |
| `complete(prompt, opts)` | `ChatResult` | Same, but non-streaming HTTP and it includes `usage` |
| `models(opts)` | `string[]` of live model ids | Before pinning, or to show what exists |
| `health(opts)` | `{ status, ready, checks[] }` | Uptime checks, and diagnosing auth |

Both `chat` and `complete` return:

```ts
type ChatResult = {
  text: string;            // may be "" when the model called a tool
  route: Route;            // who actually answered
  toolCalls: ToolCall[];   // OpenAI request shape, [] when it answered with text
  finishReason: string | null;   // "stop" | "tool_calls" | "length" | ...
  usage: Usage | null;     // non-null from complete(), usually null from chat()
  raw: unknown;            // full envelope, when you need more than these fields
};
```

### Options

| Option | Type | Notes |
| --- | --- | --- |
| `model` | `string` | `"auto"` by default. Pin with an exact live id. |
| `system` | `string` | System prompt, placed ahead of the user turn |
| `temperature`, `maxTokens` | `number` | Omitted from the request when unset |
| `tools` | `unknown[]` | OpenAI tool definitions |
| `toolChoice` | `"auto" \| "none" \| "required" \| object` | Omitted by default, which lets NAR auto-select |
| `messages` | `Message[]` | Conversation so far. Becomes the request history; a non-empty `prompt` is then appended as a final user turn. Omit `prompt` entirely for a continuation turn |
| `extra` | `object` | Merged into the body last, for anything not modelled |
| `baseUrl`, `apiKey` | `string` | Override the environment for one call |
| `signal` | `AbortSignal` | Cancellation and timeouts |

## 3. Model selection

```ts
import { models } from "@nexuss0781/nar";

const live = await models();   // 23 ids like "puter/gemma-4-26b-a4b-it"
```

Always resolve against this list before pinning. A pinned id that is not live returns
503, it does not silently fall back to something else.

```text
catalog = await models()

if user named a model id and it is in catalog -> use it exactly
else if user named a provider                  -> "auto/<provider>"
else                                          -> "auto"
```

`auto` is the default and the right answer unless you have a reason. NAR keeps a
tool-calling conversation pinned to the model that started it, so `auto` will not
change models mid-loop.

### Routing classes

Pass through `extra`; they are NAR fields, not SDK fields.

| Class | Use when | Behavior |
| --- | --- | --- |
| `agent-fast` | First token latency dominates | 3s provider deadline, then escalates |
| `agent-balanced` | Provider startup is slow | 8s deadline, then escalates |
| `quality` | Completeness beats latency | General deadline, quality-first fallback |
| `auto` | Default behavior | Progresses through fast, balanced, quality |

```ts
await chat("Summarise this", { extra: { routing_class: "agent-fast" } });
```

A timeout, 408, 429, auth failure, payment failure, or 5xx advances to the next phase
instead of surfacing an error. You get an error only after every eligible candidate
has failed.

### Latency reality check

Free providers vary a lot. A 3-second deadline fails over fast, but the last-resort
route can take 30–50s on a cold call. If a task is latency sensitive, set
`maxTokens` and use `agent-fast`, and do not assume a quick first token. NAR
synthesises the SSE stream for slower providers, so deltas can arrive in one burst
rather than token by token — that is normal, not a bug.

## 4. Tool calls

Tool calls come back in OpenAI request shape, ready to hand to your runtime. The
access is identical on `chat`, `complete`, and `streamEvents`.

```ts
const tools = [{
  type: "function",
  function: {
    name: "get_weather",
    description: "Current weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
}];

const r = await chat("What is the weather in Oslo?", { tools, toolChoice: "auto" });

if (r.finishReason === "tool_calls") {
  for (const call of r.toolCalls) {
    const args = JSON.parse(call.function.arguments);   // arguments is a JSON string
    run(call.function.name, args);
  }
}
```

`arguments` is always a string and must be parsed. A malformed payload is defaulted
to `"{}"` rather than throwing.

### Full loop

```ts
const messages = [{ role: "user", content: "Weather in Oslo, then summarise it." }];

for (let turn = 0; turn < 6; turn++) {
  const r = await chat("", { messages, tools, toolChoice: "auto" });

  if (r.finishReason !== "tool_calls") {
    console.log(r.text);
    break;
  }

  messages.push({ role: "assistant", content: r.text, tool_calls: r.toolCalls });

  for (const call of r.toolCalls) {
    const result = await runTool(call.function.name, JSON.parse(call.function.arguments));
    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: typeof result === "string" ? result : JSON.stringify(result),
    });
  }
}
```

Always echo the `assistant` message with its `tool_calls` and one `tool` message per
call, keyed by `tool_call_id`. A loop that skips this will not progress.

### Streaming with tools

```ts
for await (const e of streamEvents(prompt, { tools })) {
  for (const call of e.toolCalls) {
    console.log(call.function.name, call.function.arguments);
  }
}
```

Argument fragments arriving split across chunks are already rejoined. Each event
carries a snapshot, so an event you keep does not change later.

### Small-model warning

Free models are 1B–30B. They reliably emit valid calls but misread the request:
ask about Oslo and a call may arrive for San Francisco. Check the parsed arguments
before executing anything irreversible. Do not trust small-model tool arguments
without validation.

## 5. Errors

Every failure throws `NarError`:

```ts
import { NarError } from "@nexuss0781/nar";

try {
  await chat("hi");
} catch (e) {
  if (e instanceof NarError) {
    e.status;        // 401, 429, 503, ...
    e.code;          // "invalid_api_key", "provider_unavailable", ...
    e.route;         // Route, with attemptTrail when every route failed
    e.body;          // raw envelope
  }
  throw e;
}
```

| Status | Code | Meaning | Do |
| --- | --- | --- | --- |
| 401 | `invalid_api_key` | Bad or missing key | Fix the key. Retrying will not help |
| 401 | `missing_api_key` | No key in the environment | Set `NAR_API_KEY` |
| 403 | `model_not_allowed` | Key is scoped away from that model | Use an allowed model |
| 429 | `rate_limited` | Gateway rate limit | Back off, then retry |
| 503 | `provider_unavailable` | Every candidate failed | Retry once or twice, then report |
| 503 | `model_not_found` | Pinned id is not live | Re-read `models()` |

NAR already retried and failed over internally. A 503 means the whole free pool was
unavailable at that moment, so wrap it in your own short backoff and never loop
forever.

## 6. Which model answered

```ts
const r = await chat("hello");
r.route.provider   // "puter"
r.route.model      // "puter/infron:qwen/qwen3.8-27b:free"
```

Read from the `x-omniroute-provider` / `x-omniroute-model` response headers. Log it
when you report results, and treat `route.provider` differing from what you pinned as
a signal worth surfacing. `route.attemptTrail` is populated only when the request
failed everywhere.

## 7. Health

```ts
const h = await health();
// { status: "ok", ready: true, checks: [{ name, status, detail }] }
```

Unauthenticated, so it is safe for uptime monitoring. It reports per-provider auth
state, which is the fastest way to tell "NAR is down" from "one provider's token
expired".

## 8. Raw HTTP, for what the SDK does not wrap

The SDK covers chat only. Everything else is a normal OpenAI-compatible call.

```ts
const base = `${process.env.NAR_BASE_URL}/api/v1`;
await fetch(`${base}/embeddings`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${process.env.NAR_API_KEY}`,
  },
  body: JSON.stringify({ model: "<live embedding model id>", input: ["first", "second"] }),
});
```

If the base already ends in `/api/v1`, do not append it twice.

| Purpose | Method and path | Payload |
| --- | --- | --- |
| Discover models | `GET /models` | none |
| Chat completions | `POST /chat/completions` | `messages`, `model`, options |
| Text completions | `POST /completions` | `prompt`, `model` |
| Responses API | `POST /responses` | `input`, `model`, tools |
| Chat-compatible | `POST /api/chat` | chat-style body |
| Messages API | `POST /messages` | message-style body |
| Embeddings | `POST /embeddings` | `input`, `model` |
| Reranking | `POST /rerank` | `query`, `documents`, `model` |
| Classification | `POST /classify` | input, options |
| Moderation | `POST /moderations` | `input`, optional `model` |
| Image generation | `POST /images/generations` | `prompt`, `size`, options |
| Image edits | `POST /images/edits` | multipart |
| Image upscale | `POST /images/upscale` | multipart |
| Speech synthesis | `POST /audio/speech` | `input`, `voice`, `model` |
| Transcription | `POST /audio/transcriptions` | multipart |
| Translation | `POST /audio/translations` | multipart |
| OCR | `POST /ocr` | document or image reference |
| Segmentation | `POST /segment` | media reference |
| Search | `POST /search` | `query` |
| Web fetch | `POST /web/fetch` | `url` |
| Music generation | `POST /music/generations` | returns a job |
| Video generation | `POST /videos/generations` | returns a job |
| Create job | `POST /jobs` | JSON |
| List jobs | `GET /jobs` | none |
| Read job | `GET /jobs/{id}` | none |
| Cancel / retry / complete job | `POST /jobs/{id}/cancel`, `/retry`, `/complete` | optional JSON |
| Files | `POST /files`, `GET /files`, `GET /files/{id}`, `GET /files/{id}/content`, `DELETE /files/{id}` | multipart or none |
| Provider-scoped chat | `POST /providers/{provider}/chat/completions` | chat body |
| Provider-scoped embeddings | `POST /providers/{provider}/embeddings` | embeddings body |
| Provider-scoped images | `POST /providers/{provider}/images/generations` | image body |

### Long-running jobs

```text
1. POST /music/generations or /videos/generations
2. Save the returned job id
3. GET /jobs/{id} until it reports a completed result
4. Return the asset reference
```

## 9. Rotating the master key

`OMNIROUTE_AI_API_KEY` accepts a comma-separated list, so rotation needs no downtime:

```text
1. Set the variable to "<old key>,<new key>", redeploy. Both work.
2. Move clients to the new key.
3. Remove the old key from the list, redeploy.
```

Never shorten this to a single atomic swap; every client on the old value gets 401 at
once.

## Rules for agents

- Do not call a provider directly, and do not hand-write `curl` for chat. Go through
  NAR, so failover keeps working.
- Pin a model only when the user asked for one, and verify it against `models()`
  first. Otherwise use `auto`.
- Validate tool arguments before acting. The models are small and get the arguments wrong.
- Echo `tool_calls` and the `tool` results back into `messages`, or the loop stalls.
- On 503, back off and retry at most twice, then report. Do not spin.
- Report the serving route when it is informative: `r.route.provider` and `r.route.model`.
- Keep the caller's prompt, history, tools, and output limits intact. Do not silently
  truncate a request to make it succeed.
- Say which model answered and note when fallback changed the provider from the one
  requested.
