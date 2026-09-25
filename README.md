<div align="center">

# Nexuss AI Router

**NAR** — the OpenAI-compatible gateway that fronts your model providers behind a single key, routes every request to a healthy model, and keeps tool-calling conversations pinned to the model that started them.

[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-087ea4?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-2-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-%3E%3D22.22.2-5fa04e?style=flat-square&logo=node.js)](https://nodejs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com)

</div>

---

## Overview

Nexuss AI Router is a self-hosted AI gateway that speaks the OpenAI API. Point any OpenAI-compatible client at it and it works immediately — the client never handles a provider credential, never hardcodes a model name, and never has to handle a provider outage.

```bash
curl -sS "$NAR_BASE/api/v1/chat/completions" \
  -H "authorization: Bearer $NAR_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
```

One key in, one JSON completion out — with streaming, tool calls, and provider failover already handled.

## Why NAR

| | |
|---|---|
| **One key, every provider** | Clients authenticate once. Provider credentials stay server-side and never reach a client, a log, or a repository. |
| **Model selection that adapts** | `auto` ranks every eligible model by curated quality, capability, and live health, then escalates its latency budget until an answer lands. |
| **Tools that stay coherent** | Multi-turn tool calling is pinned to the originating model through an encoded affinity token, so a conversation never changes models mid-loop. |
| **Outages become invisible** | Per-route health tracking, provider failover, and upstream error classification turn provider failures into a slower answer instead of a broken one. |
| **Provider-agnostic** | Any OpenAI-compatible upstream can be added by declaring it in one table — no changes to routing, protocol, or client code. |
| **Stateless at the edge** | Shared state lives in Postgres, so the gateway is correct on a cold start and scales across concurrent serverless instances. |

## Capabilities

**Text and chat** — `/chat/completions`, `/completions`, `/responses`, `/messages`, with SSE streaming and multi-provider failover.

**Tool calling** — first-class `tools` / `tool_calls` support with legacy `functions` conversion, tolerant recovery of tool calls emitted as text, and affinity pinning across turns.

**Embeddings and retrieval** — `/embeddings`, `/rerank`, and `/search`.

**Images** — `/images/generations`, `/images/edits`, `/images/upscale`.

**Audio** — `/audio/speech`, `/audio/transcriptions`, `/audio/translations`.

**Video and music** — `/videos/generations`, `/music/generations`.

**Analysis** — `/moderations`, `/classify`, `/segment`, `/ocr`, and `/web/fetch`.

**Files and jobs** — `/files` for uploads and `/jobs` for asynchronous work with cancel, retry, and completion callbacks.

**Discovery** — `/models` for the live catalog, `/health` for gateway, storage, and provider status, and `/v1beta/models/{path}` for upstream passthrough.

## Quick start

```bash
export NAR_BASE="https://your-deployment"
export NAR_KEY="your-gateway-key"

# health and readiness
curl -sS "$NAR_BASE/api/v1/health" -H "authorization: Bearer $NAR_KEY"

# the live model catalog
curl -sS "$NAR_BASE/api/v1/models" -H "authorization: Bearer $NAR_KEY"

# automatic routing
curl -sS "$NAR_BASE/api/v1/chat/completions" \
  -H "authorization: Bearer $NAR_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'

# pin a provider, let NAR pick the model
curl -sS "$NAR_BASE/api/v1/chat/completions" \
  -H "authorization: Bearer $NAR_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"auto/my-provider","messages":[{"role":"user","content":"Hello"}]}'
```

Any OpenAI client works by changing the base URL and the API key:

```python
from openai import OpenAI

client = OpenAI(base_url=f"{NAR_BASE}/api/v1", api_key=NAR_KEY)
client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello"}],
)
```

## Routing

NAR resolves a request through five stages:

1. **Scope** — a `provider/model` prefix pins the route exactly; `auto/<provider>` pins the provider and lets NAR choose the model.
2. **Eligibility** — only models present in the provider catalog with a declared modality are considered.
3. **Ranking** — eligible models are scored on curated quality tier, capability, and name signals.
4. **Health** — routes are continuously scored from observed outcomes. A route that struggles is deprioritized, and the pool keeps a probe in flight so it is restored the moment it recovers.
5. **Failover** — each attempt is recorded, and the next healthy candidate is tried transparently.

### Deadline classes

Callers who care about latency can steer how eagerly NAR escalates:

```json
{ "model": "auto", "routing_class": "agent-fast", "messages": [] }
```

| `routing_class` | Behavior |
|---|---|
| `auto` *(default)* | Escalates `fast` → `balanced` → `quality` across successive attempts |
| `agent-fast` | The impatient tier; answers quickly or fails over fast |
| `agent-balanced` | Starts at `balanced` before escalating |
| `quality` | Pins the most reliable, most generous deadline |

The class that actually ran is echoed in `x-omniroute-routing-class`. Tool-result continuations always run under `quality`, because a complete tool argument matters more than a fast one.

## Tool calling

```json
{
  "model": "auto",
  "messages": [{ "role": "user", "content": "What's the weather in Oslo?" }],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "parameters": {
        "type": "object",
        "properties": { "city": { "type": "string" } },
        "required": ["city"]
      }
    }
  }]
}
```

NAR normalizes the tool protocol on the way in and on the way out, so clients may use either the modern `tools` shape or the legacy `functions` shape. Each returned tool call carries an encoded affinity token; echoing the conversation back lets NAR resume on the same model, keeping a long agent loop coherent. Providers are ranked for tool reliability from observed success, so the route that actually completes tool calls is the one that leads.

## Observability

Every response carries routing telemetry, so you can see exactly what happened without reading server logs:

| Header | Meaning |
|---|---|
| `x-omniroute-provider` | Provider that served the request |
| `x-omniroute-model` | Model as requested, provider-qualified |
| `x-omniroute-routing-class` | Deadline class applied: `fast`, `balanced`, or `quality` |
| `x-omniroute-attempt-trail` | Ordered `provider/model:status` list of every attempt |
| `x-omniroute-failure-codes` | Failure codes from those attempts, in order |
| `x-omniroute-tool-protocol` | Normalized tool protocol in use |
| `x-omniroute-tool-affinity` | Affinity token to echo back on the next turn |
| `x-omniroute-execution` | Which runtime executed the request |
| `x-omniroute-render-forwarded` | Present when served by the long-lived runtime |

`/api/v1/health` reports gateway readiness, storage connectivity, per-provider model counts, and failover state in one payload.

## Configuration

Client applications need exactly one credential: the gateway key. Provider keys stay server-side.

| Variable | Purpose |
|---|---|
| `OMNIROUTE_AI_API_KEY` | The single key clients authenticate with |
| `OMNIROUTE_<PROVIDER>_API_KEY` | Server-side credential for a provider |
| `OMNIROUTE_<PROVIDER>_BASE_URL` | Override a provider's base URL |
| `OMNIROUTE_<PROVIDER>_MODELS` | Override a provider's model list |
| `OMNIROUTE_AI_PROVIDER_ID` / `_BASE_URL` / `_API_KEY` / `_FORMAT` / `_MODELS` | Generic single-provider path |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Policy, usage, and shared-state storage |
| `RENDER_SERVICE_URL`, `RENDER_INTERNAL_SECRET` | Long-lived failover runtime |

### Adding a provider

Providers are declared in one table. Add an entry and NAR picks it up everywhere — catalog, eligibility, ranking, failover, and the health endpoint:

```ts
{
  id: "my-provider",
  baseUrl: "https://api.my-provider.com/v1",
  apiKey: "",
  format: "openai",
  priority: 980,
  models: ["my-model"],
}
```

Supply the credential through `OMNIROUTE_MY_PROVIDER_API_KEY`, then curate the model's modality and quality in `modelMetadata.ts` so it is eligible for automatic routing. Any OpenAI-compatible upstream works without further changes.

## Architecture

```
OpenAI client ──Bearer gateway key──► NAR (Next.js route handlers)
                                        │
                                        ├─ authentication + policy
                                        ├─ candidate pool  (catalog ∩ capability ∩ health)
                                        ├─ tool affinity decode ─► preferred route
                                        ├─ attempt loop ──► upstream provider
                                        │     └─ response classification + stream preflight
                                        └─ long-lived runtime failover
```

The gateway is stateless at the edge: shared state lives in Postgres, so correctness never depends on a warm instance and concurrency is unbounded. The optional long-lived runtime (`render/server.mjs`) handles stateful work and acts as a failover target, with health-gated forwarding that cannot loop back.

### Repository layout

```
src/app/api/                     route handlers, one directory per endpoint
src/lib/vercel-ai-gateway/
  gateway.ts                     provider assembly, ranking, failover, streaming
  toolProtocol.ts                tool normalization and affinity encoding
  routeHealth.ts                 per-route health scoring and telemetry
  upstreamResponse.ts            response classification and stream preflight
  modelMetadata.ts               curated capability and quality rows
  repositories.ts                shared-state persistence
src/lib/vercel-parad/            request-scoped persistence helpers
src/lib/aiRoute.ts               edge wrapper and failover
render/server.mjs                long-lived runtime
scripts/                         smoke test and migrations
docs/                            architecture notes
```

## Development

```bash
npm install
npm run dev            # local development
npm run build          # production build
npm run db:migrate     # apply database schema
npm run smoke -- "$NAR_BASE"   # endpoint smoke test
npm run render:start   # long-lived runtime
```

Requires Node.js 22.22.2 or newer.

## Documentation

- [Low-Latency Architecture](docs/LOW_LATENCY_ARCHITECTURE.md) — request lifecycle and latency design
- [Low-Latency Implementation](docs/LOW_LATENCY_IMPLEMENTATION.md) — the implementation record
- [Render Runtime](render/README.md) — long-lived runtime and failover
- [Agent Skill](SKILL/SKILL.md) — instructions for agents driving the gateway
