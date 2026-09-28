<div align="center">

# Nexuss AI Router

**One endpoint. Any model. You never handle a rate limit again.**

[![npm](https://img.shields.io/npm/v/@nexuss0781/nar-000000?style=flat-square&logo=npm)](https://www.npmjs.com/package/@nexuss0781/nar)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.0-087ea4?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.22.2-5fa04e?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-000000?style=flat-square)](./LICENSE)

</div>

---

## The problem

Every free model comes with a limit. Yours will hit it — usually at 2am, usually
mid-run, usually in the middle of an agent loop. So you write retry logic, a
backoff timer, a model-fallback chain, and a health check you will forget to
maintain. Then a new provider appears and the whole thing needs revisiting.

That layer is the same in every project, and it is almost never the interesting
part.

**NAR is that layer, already built.** You send a request. NAR picks a model that is
not currently limited, and if something goes wrong it moves to another one
transparently. A 429 never reaches your code — you get an answer, or an error that
is actually about your request.

## The result

**1,325+ requests per minute. 24 hours a day. About 44 concurrent agents.**

No rate-limit handling, no backoff, no fallback chain, no monitoring. Just completions.

---

## Install

```bash
npm install @nexuss0781/nar
```

Zero dependencies. 9.2 kB. Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge.

```bash
export NAR_API_KEY="<your key>"
```

```ts
import { stream } from "@nexuss0781/nar";

for await (const delta of stream("explain ownership in Rust")) {
  process.stdout.write(delta);
}
```

That is the whole integration. There is no client to configure, no provider to
choose, and no limit to respect.

Already using an OpenAI client? Point its base URL at NAR and it keeps working —
the wire format is unchanged.

---

## How NAR keeps you off rate limits

This is the core of the product, so it is worth being specific about.

**Budgets are tracked per model, and they refill every minute.** Each model gets
its own one-minute window, so capacity is continuously available rather than drawn
from a pool that drains and resets. Nothing is saved up for later, and nothing runs
out mid-minute.

**Upstream headers are trusted.** Providers that publish remaining-quota headers are
read directly, so NAR knows what is actually left instead of guessing and
discovering the answer from a 429. A model that reports zero is held for the
remainder of its window rather than being tried and failed.

**Rate limits are classified as retryable, not fatal.** A 429, a timeout, or a 5xx
does not end the request. NAR marks the model, cools it down, and continues to the
next candidate within the same call. The escalation order is a deadline ladder —
impatient, balanced, thorough — so a request gets progressively more time and more
candidates rather than failing early.

**Recovery is automatic.** A probe stays in flight against limited routes, and a
model is returned to rotation the moment it recovers. Capacity comes back without
anyone noticing it was gone.

**Tool conversations are pinned.** An agent loop keeps the model it started on, so a
long multi-turn run does not thrash across a rotating pool and trip limits that
would never have been hit with a stable route.

The net effect: **your code never sees a 429, never writes a backoff, and never
needs to know which model is busy.**

---

## Model selection

Three levels of intent:

| You want | Send | Result |
|---|---|---|
| The best model available right now | `"auto"` | NAR ranks and picks, then moves on if needed |
| One source, NAR's choice of model | `"auto/<source>"` | Scoped to that source |
| Exactly this model | `"<source>/<model-id>"` | Pinned; no silent substitution |

`auto` is the default and the right answer unless you have a specific reason. A
pinned id that is not currently available returns a clear error rather than quietly
serving something else.

```ts
import { models } from "@nexuss0781/nar";

const available = await models();
```

### Latency control

```ts
await chat("Ship the checklist", { extra: { routing_class: "agent-fast" } });
```

| `routing_class` | Behavior |
|---|---|
| `auto` *(default)* | Escalates `fast` → `balanced` → `quality` across attempts |
| `agent-fast` | Short deadline, moves on quickly |
| `agent-balanced` | Moderate deadline before escalating |
| `quality` | Full deadline, completeness-first candidates |

The class that actually ran is echoed back in `x-omniroute-routing-class`, so you
can see how much escalation a request needed.

---

## Tool calling

```ts
import { chat } from "@nexuss0781/nar";

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

`toolCalls` and `finishReason` come back identically from `chat`, `complete`, and
`streamEvents`, so the same loop works streamed or not. Argument fragments split
across stream chunks are already rejoined for you.

`tool_choice` is enforced by NAR rather than delegated: `"none"` withholds the tool
schema entirely, so the guarantee holds the same on every route instead of
depending on which one served the turn.

---

## API

Six calls, each with one job:

| Call | Returns | Use for |
|---|---|---|
| `stream(prompt, opts)` | `AsyncGenerator<string>` | Text as it arrives |
| `streamEvents(prompt, opts)` | `AsyncGenerator<StreamEvent>` | Streaming you also need tool calls from |
| `chat(prompt, opts)` | `ChatResult` | The normal choice |
| `complete(prompt, opts)` | `ChatResult` | Non-streaming, reports `usage` |
| `models(opts)` | `string[]` | What is available right now |
| `health(opts)` | `{ status, ready, checks[] }` | Uptime and auth diagnosis |

```ts
const r = await chat("Summarise this changelog", { maxTokens: 400 });

r.text;            // the answer
r.route.provider;  // which source served it
r.route.model;     // which model served it
r.finishReason;    // "stop" | "tool_calls" | "length"
r.toolCalls;       // [] when it answered with text
r.usage;           // populated by complete()
```

Options: `model`, `system`, `temperature`, `maxTokens`, `tools`, `toolChoice`,
`messages`, `extra`, `baseUrl`, `apiKey`, `signal`. `prompt` is optional, so a
continuation turn can be `chat("", { messages })`.

### Errors

Every failure throws `NarError` with `status`, `code`, `route`, and `body`. Because
NAR fails over internally, an error means the request itself is the problem.

| Status | Meaning | Do |
|---|---|---|
| 401 `invalid_api_key` | Bad or missing key | Fix the key |
| 403 `model_not_allowed` | Key scoped away from that model | Use an allowed model |
| 429 `rate_limited` | Your key's own budget | Back off briefly |
| 503 `provider_unavailable` | Every candidate was unavailable | Retry once or twice |
| 503 `model_not_found` | Pinned id is not available | Re-read `models()` |

Note what is absent: there is no "this model is busy" error to handle, because
being busy is NAR's problem to solve, not yours.

---

## Observability

| Header | Meaning | Present |
|---|---|---|
| `x-omniroute-provider` | Which source served the request | always |
| `x-omniroute-model` | Which model served it | always |
| `x-omniroute-routing-class` | Deadline class applied | always |
| `x-omniroute-tool-protocol` | Normalized tool protocol in use | tool requests |
| `x-omniroute-tool-affinity` | Token to echo back next turn | tool requests |
| `x-omniroute-attempt-trail` | Every route tried, with status | failures |
| `x-omniroute-failure-codes` | Why each was rejected, in order | failures |

`x-omniroute-attempt-trail` is the one worth logging: it turns an opaque failure
into the full list of candidates and why each one was skipped.

```ts
import { health } from "@nexuss0781/nar";

const h = await health();   // unauthenticated, safe for uptime checks
```

Health reports gateway readiness, storage, and a per-provider auth probe — the
fastest way to separate "something is wrong with NAR" from "one credential needs
attention".

---

## Configuration

Clients hold one credential. Everything else stays server-side.

| Variable | Purpose |
|---|---|
| `OMNIROUTE_AI_API_KEY` | The key clients authenticate with |
| `OMNIROUTE_<PROVIDER>_API_KEY` | Server-side credential for a source |
| `OMNIROUTE_<PROVIDER>_BASE_URL` | Override a source's base URL |
| `OMNIROUTE_<PROVIDER>_MODELS` | Override its model list |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Policy, usage, shared state |
| `RENDER_SERVICE_URL`, `RENDER_INTERNAL_SECRET` | Long-lived failover runtime |

### Rotating the key

`OMNIROUTE_AI_API_KEY` accepts a comma-separated list, so rotation needs no
downtime and no coordinated client deploy:

```text
1. Set it to "<old key>,<new key>" and redeploy. Both work.
2. Move clients to the new key.
3. Remove the old key and redeploy.
```

Every candidate is compared without an early exit, so a match never reveals its
position in the list through response timing.

### Adding a source

One table entry, and NAR picks it up everywhere — catalog, ranking, failover, and
health. No changes to routing, protocol, or client code:

```ts
{
  id: "my-source",
  baseUrl: "https://api.example.com/v1",
  format: "openai",
  priority: 980,
  models: ["my-model"],
}
```

Then curate the model's capability and quality in `modelMetadata.ts` so it becomes
eligible for automatic routing.

---

## Architecture

```
client ──Bearer key──► NAR
                        │
                        ├─ authentication + policy
                        ├─ rate limiting (per source, per model)
                        ├─ candidate pool  (catalog ∩ capability ∩ health)
                        ├─ tool affinity ──► preferred model
                        ├─ attempt loop ──► upstream
                        │     └─ classification + retry decisions
                        └─ long-lived runtime failover
```

Stateless at the edge, with shared state in Postgres — correct on a cold start and
correct across concurrent instances. Adding capacity means adding instances; it
does not mean re-architecting.

---

## Development

```bash
npm install
npm run dev            # local development
npm run build          # production build
npm run db:migrate     # apply database schema
npm run smoke -- "$NAR_BASE"   # endpoint smoke test
npm run render:start   # long-lived runtime
```

Node.js 22.22.2 or newer. The SDK is a separate package:

```bash
cd sdk
npm install
npm run build          # emit dist/ with declarations
npm run typecheck
```

---

## Documentation

- [Agent Skill](SKILL/SKILL.md) — instructions for agents driving the gateway
- [Provider & Model Admission Criteria](CRITERIA.md) — the standard each source is measured against
- [Contributing](CONTRIBUTING.md) — add a source or improve the gateway
- [Low-Latency Architecture](docs/LOW_LATENCY_ARCHITECTURE.md) — request lifecycle and latency design
- [Low-Latency Implementation](docs/LOW_LATENCY_IMPLEMENTATION.md) — the implementation record
- [Render Runtime](render/README.md) — long-lived runtime and failover

## Contributing

NAR accepts new model sources into its pool. Start with the
[contributing guide](CONTRIBUTING.md); the [admission criteria](CRITERIA.md) define
what a source and each of its models must satisfy and how they are verified.

## License

MIT.
