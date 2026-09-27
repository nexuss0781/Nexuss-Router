# @nexuss0781/nar

Minimal TypeScript client for **Nexuss AI Router (NAR)**. Zero dependencies.

Do not hand-write `curl` requests, and do not call a provider directly. NAR routes
every call to a healthy free model and falls back automatically when one is busy.

## Install

```bash
npm install @nexuss0781/nar
```

Zero dependencies. Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge.

```bash
export NAR_BASE_URL="https://omniouter-vercel.vercel.app"
export NAR_API_KEY="<your master key>"
```


## Stream a completion

```ts
import { stream } from "@nexuss0781/nar";

for await (const delta of stream("Explain ownership in Rust in two sentences")) {
  process.stdout.write(delta);
}
```

## Get the whole answer

```ts
import { chat } from "@nexuss0781/nar";

const { text, route } = await chat("Write a haiku about routers");
console.log(text);
console.log(route.provider, route.model);   // e.g. "puter  puter/infron:qwen/qwen3.8-27b:free"
```

## Which model actually answered

`route.provider` and `route.model` come from NAR's response headers, not from
guessing. Log them — they are how you measure which free route is actually
carrying traffic, and how you tell a silent fallback from a healthy call.

```ts
const { text, route } = await chat(prompt);
console.log(`[${route.provider}/${route.model}] ${text.length} chars`);
```

## Pin a specific model

Only when you need determinism. Omit `model` to let NAR choose.

```ts
await chat("hi", { model: "puter/infron:qwen/qwen3.8-27b:free" });
```

Call `models()` to list what is live right now:

```ts
import { models } from "@nexuss0781/nar";
console.log(await models());
```

## Tool calling

Tool calls come back in OpenAI request shape, ready to hand straight to your runtime.
`toolCalls` and `finishReason` are populated by `chat`, `complete` and `streamEvents` alike.

```ts
import { chat } from "@nexuss0781/nar";

const r = await chat("What is the weather in Oslo?", {
  tools: [{
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
  }],
  toolChoice: "auto",
});

if (r.finishReason === "tool_calls") {
  for (const call of r.toolCalls) {
    run(call.function.name, JSON.parse(call.function.arguments));
  }
}
```

Streaming reassembles argument fragments for you. Each event carries a snapshot of the
calls accumulated so far, so an event you keep does not change underneath you:

```ts
import { streamEvents } from "@nexuss0781/nar";

for await (const event of streamEvents(prompt, { tools })) {
  for (const call of event.toolCalls) {
    console.log(call.function.name, call.function.arguments);
  }
}
```

## Multi-turn and tool loops

Pass `messages` to keep the conversation. Without it every call is stateless and the
model loses all earlier context. `prompt` is optional; a non-empty one is appended as
a final user turn.

```ts
import { chat } from "@nexuss0781/nar";

const tools = [/* ... */];
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

Always echo the assistant message with its `tool_calls`, and one `tool` message per
call keyed by `tool_call_id`. A loop that skips this will not progress.

`toolChoice: "none"` forces a text answer even when tools are available;
`"required"` demands a call. Omitting it lets NAR decide.

Free models are small: they emit valid calls but can misread the request, so validate
parsed arguments before doing anything irreversible.

NAR keeps a tool-calling conversation pinned to the model that started it, so a
multi-turn tool loop does not silently change models mid-conversation.

## Errors

```ts
import { NarError } from "@nexuss0781/nar";

try {
  await chat("hi");
} catch (error) {
  if (error instanceof NarError) {
    console.error(error.status, error.code, error.message);
    console.error(error.route.attemptTrail);   // providers that failed before this one
  }
}
```

`attemptTrail` is populated when a request failed everywhere. It is the fastest way
to tell "the model was bad" from "every free tier was rate-limited".

## Health

```ts
import { health } from "@nexuss0781/nar";
const report = await health();
console.log(report.checks.find((c) => c.name === "puter_auth"));
```

`puter_auth` reports `ok`, `rejected` (token died — sign out/in again) or
`unreachable` (network trouble, token probably fine). Check this before debugging
a slow provider, because a silently failing provider still returns 200 traffic
routed elsewhere.

## API

| Function | Returns |
| --- | --- |
| `stream(prompt, opts?)` | `AsyncGenerator<string>` of text deltas |
| `streamEvents(prompt, opts?)` | `AsyncGenerator<StreamEvent>` with tool calls + route |
| `chat(prompt, opts?)` | `Promise<ChatResult>` — text + route |
| `complete(prompt, opts?)` | `Promise<ChatResult>` — non-streaming, keeps usage |
| `models(opts?)` | `Promise<string[]>` of live model ids |
| `health(opts?)` | `Promise<HealthReport>` |

`ChatOptions`: `model`, `system`, `temperature`, `maxTokens`, `tools`, `signal`,
`baseUrl`, `apiKey`, `extra`.

## Rules for agents

- Always default to `model: "auto"`. Pin a model only for tests that must be
  reproducible.
- Never read a provider API key. One NAR master key is the whole credential.
- Never retry on 429 yourself; NAR already falls back. Retry only on `5xx`, and
  at most twice.
- Never assume a model name is stable. Call `models()` if you need to verify one.
- Streaming responses usually omit `usage`. Do not assert on token counts.
