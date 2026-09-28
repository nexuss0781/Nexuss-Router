<div align="center">

# Nexuss AI Router

### One endpoint. Every model. You will never write rate-limit handling again.

[![npm](https://img.shields.io/npm/v/@nexuss0781/nar-000000?style=flat-square&logo=npm)](https://www.npmjs.com/package/@nexuss0781/nar)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2.0-087ea4?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0.2-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.22.2-5fa04e?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-000000?style=flat-square)](./LICENSE)

</div>

---

<div align="center">

| | |
|---|---|
| **Integration** | `npm install @nexuss0781/nar` — or point an agent at one file |
| **Dependencies** | Zero |
| **Bundle** | 9.2 kB |
| **Runtimes** | Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge |
| **Rate limits you handle** | None |
| **Capacity** | 1.9M calls/day — ~3,000× a heavy agent workload |
| **Client credentials** | One key |

</div>

---

## Use it for free in five steps

**1. Fork this repository.**

**2. Deploy it to Vercel.** Import the fork, accept the defaults, deploy. You get
a URL like `https://nar-abc123.vercel.app`.

**3. Set two environment variables.** In the Vercel project, add:

| Variable | Value |
|---|---|
| `OMNIROUTE_AI_API_KEY` | Any random string you invent |
| *one* source credential | `OMNIROUTE_PUTER_TOKEN`, or a free key from any source in [`.env.example`](.env.example) |

Redeploy. That is the entire configuration — [`.env.example`](.env.example)
lists every optional variable and what it changes.

**4. Point the SDK at your deployment.**

```ts
import { createClient } from "@nexuss0781/nar";

const nar = createClient({
  baseUrl: "https://nar-abc123.vercel.app",
  apiKey: process.env.NAR_API_KEY!,
});

const r = await nar.chat("Explain ownership in Rust");
console.log(r.text);
```

**5. Let an agent do the rest.** Point any agent at
[the skill](.opencode/skills/nexuss-ai-router/SKILL.md) and it integrates NAR
into your app on its own.

There is no billing step because there is nothing to bill. You run it, you use
the free tiers you already have access to, and you never see a rate limit.

---

## Your agent can integrate this by itself

There is a complete instruction file in this repository. An agent reads it once
and knows everything — how to call the API, how to run a tool loop, how to pick a
model, what every error means, and what not to do.

```
.opencode/skills/nexuss-ai-router/SKILL.md
```

That is the whole human effort. **You do not write the integration, and you do not
explain it.** Hand an agent the path, or let it discover the skill, and it wires
itself up correctly on the first attempt — because the file tells it exactly what
to do instead of making it guess from an API reference and get the tool-call
plumbing wrong.

It is 401 lines, dependency-free, and versioned with the gateway, so it cannot
describe an interface that no longer exists.

<details>
<summary><b>It covers, in order of when you need it</b></summary>

- A decision table for picking a path before writing any code
- Installation and environment
- The six calls, and what each is for
- Options, with the exact semantics of each
- Model selection: `auto`, scoped, or pinned — and when each is right
- Latency classes for speed-sensitive work
- Tool calling, including a complete working multi-turn loop
- `NarError`, with a table of what to do for each status
- Which model answered, and how to log it
- Health checks for uptime monitoring
- Raw HTTP, for the endpoints the SDK does not wrap
- Rotating the key without downtime
- A closing rules section — what an agent should never do

</details>

---

## Why you need this

Every model has a limit. Yours will hit it — usually at 2am, usually mid-run,
usually inside an agent loop that has nowhere to go.

So you write retry logic. Then a backoff timer. Then a fallback chain across
models. Then a health check you will forget to maintain. Then a new model appears
and all of it needs revisiting.

That layer is identical in every project and is never the interesting part.

> **NAR is that layer, already built.** You send a request. NAR picks a model that
> is not currently limited, and if something goes wrong it moves to another one
> inside the same call. A rate limit never reaches your code.

---

## You will not hit a limit

Not because the limits are generous. Because your workload is orders of magnitude
smaller than the pool, and because the pool handles its own pressure instead of
exporting it to you.

```
workload vs capacity          share of a full day       █ = 10% of capacity

one agent · 20 sessions/day            0.03%  ▏
ten agents · all day                   0.16%  ▏
fifty agents · all day                 0.79%  ▏
a continuous loop · 1 call / 2s        2.26%  █
────────────────────────────────────────────────────────────
NAR capacity                            100%   ██████████████████████████
```

A busy day of agent work is **hundreds** of calls. NAR serves **1.9 million**.
You would need roughly **3,000 agents running flat out** before a single day came
close to the ceiling — and even then, nothing fails: models are held, cooled, and
replaced, and the request keeps going.

The number is not the argument. The argument is that the ceiling is not something
your code participates in.

---

## Install

```bash
npm install @nexuss0781/nar
```

```bash
export NAR_BASE_URL="https://nar-abc123.vercel.app"   # your deployment
export NAR_API_KEY="<your OMNIROUTE_AI_API_KEY>"
```

```ts
import { stream } from "@nexuss0781/nar";

for await (const delta of stream("explain ownership in Rust")) {
  process.stdout.write(delta);
}
```

No client to configure, no model to choose, no limit to respect. An existing
OpenAI client keeps working unchanged — the wire format is the same.

### Bind the deployment once

`createClient` takes the URL and key a single time, so neither is repeated at
every call site:

```ts
import { createClient } from "@nexuss0781/nar";

const nar = createClient({
  baseUrl: "https://nar-abc123.vercel.app",
  apiKey: process.env.NAR_API_KEY!,
});

const r = await nar.chat("Summarise this changelog", { maxTokens: 400 });
```

The six calls work identically on the client and as free functions. Prefer
`createClient()` in an app, and the free functions in a script.

The URL is required rather than defaulted, because every fork deploys somewhere
different and a default would silently send your key to someone else's
deployment. Set `NAR_BASE_URL` or pass `baseUrl`, and the error message says so if
you forget. `/api/v1` is appended for you if you include it.

---

## How NAR stays ahead of the limits

Budgets are tracked per model and **refill every minute**, so capacity is
continuously available rather than drawn from a pool that drains and resets.
Nothing is saved for later, and nothing runs out partway through a minute.

Upstream **remaining-quota headers are read directly**, so remaining capacity is
known rather than guessed at. A model reporting zero is held for the rest of its
window instead of being tried and failed.

**Rate limits are retryable, never fatal.** A 429, timeout, or 5xx marks the
model, cools it, and continues to the next candidate inside the same request. The
escalation is a deadline ladder — impatient, balanced, thorough — so a request
gains more time and more candidates rather than giving up.

**Recovery is automatic.** A probe stays in flight against limited routes, and a
recovered model re-enters rotation on its own. Capacity returns without anyone
noticing it left.

**Tool conversations are pinned**, so a long multi-turn run holds one model
instead of thrashing the pool and tripping limits a stable route never would.

You get an answer, or an error about your request. Nothing in between.

---

## API

| Call | Returns | Use for |
|---|---|---|
| `stream(prompt, opts)` | `AsyncGenerator<string>` | Text as it arrives |
| `streamEvents(prompt, opts)` | `AsyncGenerator<StreamEvent>` | Streaming, and you need tool calls too |
| `chat(prompt, opts)` | `ChatResult` | The normal choice |
| `complete(prompt, opts)` | `ChatResult` | Non-streaming, reports `usage` |
| `models(opts)` | `string[]` | What is available right now |
| `health(opts)` | `{ status, ready, checks[] }` | Uptime and diagnosis |
| `createClient({ baseUrl, apiKey })` | `NarClient` | Bind the deployment once |

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
continuation turn is `chat("", { messages })`.

### Errors

| Status | Meaning | Do |
|---|---|---|
| 401 `invalid_api_key` | Bad or missing key | Fix the key |
| 403 `model_not_allowed` | Key scoped away from that model | Use an allowed model |
| 429 `rate_limited` | Your own key's budget | Back off briefly |
| 503 `provider_unavailable` | Every candidate was unavailable | Retry once or twice |
| 503 `model_not_found` | Pinned id is not available | Re-read `models()` |

There is deliberately no "this model is busy" error. Being busy is NAR's problem
to solve, not yours.

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
`streamEvents`, so one loop works streamed or not. Argument fragments split across
stream chunks are rejoined for you.

`tool_choice` is enforced by NAR rather than delegated: `"none"` withholds the
schema entirely, so the guarantee is identical on every route instead of depending
on which one served the turn.

---

## Model selection

| You want | Send | Result |
|---|---|---|
| The best model available now | `"auto"` | NAR ranks and picks, moves on if needed |
| One source, NAR's choice of model | `"auto/<source>"` | Scoped to that source |
| Exactly this model | `"<source>/<model-id>"` | Pinned, no silent substitution |

`auto` is the default and the right answer unless you have a reason. A pinned id
that is not currently available returns a clear error rather than quietly serving
something else.

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

The class that actually ran comes back in `x-omniroute-routing-class`, so you can
see how much escalation a request needed.

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
into the full list of candidates and why each was skipped.

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
downtime and no coordinated deploy:

```text
1. Set it to "<old key>,<new key>" and redeploy. Both work.
2. Move clients to the new key.
3. Remove the old key and redeploy.
```

Every candidate is compared without an early exit, so a match never reveals its
position through response timing.

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
correct across concurrent instances. Adding capacity means adding instances, not
re-architecting.

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

- [Agent Skill](.opencode/skills/nexuss-ai-router/SKILL.md) — the integration guide an agent reads
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
