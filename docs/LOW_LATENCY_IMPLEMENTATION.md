# OmniRoute Low-Latency Gateway: Complete Implementation Record

**Status:** Implemented and pushed to the `main` branch. The latest implementation commit is `174d906`.

## Executive summary

OmniRoute now uses a Vercel-compatible low-latency gateway design in which Supabase stores hot configuration, authorization policies, atomic provider limits, and a durable usage queue. Parad is removed from synchronous chat handling whenever Supabase is configured. Parad remains the durable archive target and is written by a secured worker that runs every five minutes.

The request path authenticates the caller, reads cached routing state, selects an eligible provider and model, invokes the upstream provider with a bounded deadline, and streams the response. Usage accounting is enqueued asynchronously. The browser never receives provider credentials, Supabase service-role credentials, or the Parad API key.

## Request path

The synchronous chat flow is:

1. The gateway validates the bearer token locally when `OMNIROUTE_AI_API_KEY` is configured.
2. Policy-based keys are resolved from the warm Supabase policy cache.
3. Provider configuration is resolved from the warm Supabase provider cache.
4. Automatic routing filters excluded, unavailable, and non-chat models.
5. A health-aware candidate is selected while temporary local cooldown hints are respected.
6. The upstream request starts with a route-class deadline.
7. Streaming responses are forwarded immediately and usage is queued when the stream completes.
8. Non-streaming responses are returned without awaiting usage persistence.

When Supabase is configured, the chat path does not call the Parad snapshot repository for provider reads, policy reads, usage writes, or provider reservations. This prevents per-request snapshot download, database initialization, and snapshot upload overhead.

## Routing classes

The request body may include a `routing_class` value. If it is omitted, the compatibility value `auto` is used.

# New: routing capabilities and endpoint usage

The low-latency routing capabilities are available through the standard chat endpoint:

```text
POST https://omniouter-vercel.vercel.app/api/v1/chat/completions
```

The endpoint accepts the normal OpenAI-compatible chat request fields and adds the optional `routing_class` field. The model can be `auto`, `auto/<provider-id>`, or an exact provider-qualified model ID.

### Fast routing

Use `agent-fast` when the agent needs the earliest possible response and can accept a shorter initial provider deadline. The first candidate receives a three-second deadline. If it times out or fails with a retryable status, the gateway automatically continues with the balanced phase and then the quality phase rather than stopping immediately.

```bash
curl -N https://omniouter-vercel.vercel.app/api/v1/chat/completions \
  -H "Authorization: Bearer $OMNIROUTE_AI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "routing_class": "agent-fast",
    "stream": true,
    "messages": [{"role": "user", "content": "Give me a concise deployment checklist."}]
  }'
```

### Balanced routing

Use `agent-balanced` when the request needs more provider startup time while still avoiding the general long timeout. The first candidate receives an eight-second deadline. If it fails, the gateway escalates to quality candidates with the longer deadline.

```json
{
  "model": "auto",
  "routing_class": "agent-balanced",
  "stream": true,
  "messages": [
    {"role": "user", "content": "Compare these two implementation approaches."}
  ]
}
```

### Quality routing

Use `quality` for requests where answer quality and completion reliability are more important than the earliest first token. The gateway permits the general provider deadline and continues through eligible quality candidates when a retryable failure occurs.

```json
{
  "model": "auto",
  "routing_class": "quality",
  "messages": [
    {"role": "user", "content": "Produce a detailed architecture review with tradeoffs."}
  ]
}
```

### Provider-scoped usage

Any routing class can be combined with provider-scoped automatic selection. This preserves the routing policy while limiting candidates to one provider family.

```json
{
  "model": "auto/kilo-gateway",
  "routing_class": "agent-fast",
  "stream": true,
  "messages": [{"role": "user", "content": "Return a short TypeScript example."}]
}
```

### Exact-model usage

An exact model ID bypasses broad automatic model selection. The routing class still controls the provider deadline, but the request is not allowed to switch to an unrelated model.

```json
{
  "model": "kilo-gateway/nvidia/nemotron-3-super-120b-a12b:free",
  "routing_class": "agent-balanced",
  "messages": [{"role": "user", "content": "Summarize this input in three sentences."}]
}
```

### Response diagnostics

Successful responses expose the selected route through these headers:

| Header | Meaning |
|---|---|
| `x-omniroute-provider` | Provider that returned the response |
| `x-omniroute-model` | Provider-qualified model selected for the request |
| `x-omniroute-routing-class` | Deadline phase that completed the request: `fast`, `balanced`, or `quality` |

Clients should keep `stream: true` when time to first token matters. A routing class reduces gateway waiting and controls fallback deadlines, but it cannot make an upstream model generate its first token faster than the provider itself allows.

| Routing class | Intended use | Initial deadline behavior | Fallback behavior |
|---|---|---:|---|
| `agent-fast` | Latency-sensitive agents | First attempt uses a 3-second deadline | Escalates to balanced, then quality candidates |
| `agent-balanced` | General agent workloads | First attempt uses an 8-second deadline | Escalates to quality candidates |
| `quality` | Quality-first or long-running text requests | Uses the general provider deadline | Uses eligible quality candidates |
| `auto` | Compatibility mode | Starts with the fast phase for automatic requests | Gradually escalates through balanced and quality |

A retryable upstream failure includes timeout, HTTP 408, HTTP 429, authorization failures, payment failures, and HTTP 5xx responses. The gateway records a cooldown hint and continues to the next eligible route. An error is returned only after all eligible candidates and escalation phases have failed.

The response reports the selected provider and model through `x-omniroute-provider` and `x-omniroute-model`. It also reports the completed phase through `x-omniroute-routing-class`.

Example request:

```json
{
  "model": "auto",
  "routing_class": "agent-fast",
  "stream": true,
  "messages": [
    {"role": "user", "content": "Write a concise implementation plan."}
  ]
}
```

## Model categorization

The gateway maintains model metadata in `src/lib/vercel-ai-gateway/modelMetadata.ts`. Catalog entries can include the following fields:

| Field | Purpose |
|---|---|
| `family` | Groups models such as GPT/OpenAI, Qwen, Llama, Claude, or other families |
| `modality` | Identifies text chat, vision-capable chat, audio, image, video, or other capabilities |
| `task_role` | Describes general chat, coding, reasoning, generation, search, or safety roles |
| `quality_tier` | Provides a relative quality classification |
| `priority` | Expresses gateway preference order |
| `confidence` | Indicates classification confidence |
| `taxonomy_source` | Records the source of the classification |

Automatic chat routing uses this metadata to reject incompatible modalities, exclude disabled models, prefer text-capable candidates, and add model-family signals to the ranking score. The catalog is not discovered synchronously from provider `/models` endpoints. Providers use configured model lists, built-in safe lists, and Supabase-persisted overrides. A future scheduled catalog refresh can update the persisted catalog without affecting the chat request path.

Exact model requests remain exact. For example, `kilo-gateway/nvidia/nemotron-3-super-120b-a12b:free` is routed to the named provider and model rather than being treated as a broad automatic request. Provider-scoped automatic requests use values such as `auto/kilo-gateway`.

## Supabase hot-path adapter

`src/lib/supabaseGateway.ts` provides a server-side REST adapter with an in-memory warm cache. The cache covers provider connections, API-key policies, and model overrides. Its default time-to-live is 30 seconds and can be changed with `OMNIROUTE_CACHE_TTL_MS`.

The adapter uses `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY` together with `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`. These values must remain server-side. The service-role key must never be exposed through a client bundle or response.

The provider list, policy list, and model override list are loaded only when their cache entries expire. A Supabase failure does not silently authorize an unknown key. Provider fallback to the legacy Parad repository remains available for non-Supabase deployments, preserving compatibility with the original profile.

## Durable usage accounting

Each completed request produces a compact event containing an identifier, API-key policy identifier when applicable, provider, model, endpoint, status, latency, token counts when available, and creation time. With Supabase configured, this event is written to `ai_usage_queue` asynchronously and is not awaited by the response path.

For streamed responses, the gateway wraps the upstream stream and enqueues a successful event after the stream closes or is cancelled. The current stream event does not attempt to parse provider-specific token trailers, so token fields may be null for streams that do not expose usage in a standardized final event.

The durable queue, rather than a detached JavaScript task or local file, is the durability boundary.

## Supabase database objects

The migration is stored in `supabase/migrations/001_low_latency_gateway.sql`. It creates or updates the following objects:

| Object | Role |
|---|---|
| `ai_provider_connections` | Durable provider URLs, formats, encrypted-at-rest deployment credentials, model lists, and priorities |
| `ai_api_key_policies` | Hashed gateway keys, scopes, model restrictions, endpoint restrictions, and expiry data |
| `ai_model_overrides` | Persisted model display names and capability metadata |
| `ai_provider_request_limits` | Shared provider cooldown and daily request counters |
| `ai_usage_queue` | Durable usage events with pending, leased, synced, and dead-letter states |
| `ai_parad_batches` | Batch synchronization records and Parad version metadata |
| `reserve_provider_request` | Row-locked atomic provider limit reservation function |
| `claim_usage_batch` | Lease-based, skip-locked queue claim function |
| `complete_usage_batch` | Idempotent success, retry, and dead-letter transition function |

The provider reservation function prevents concurrent requests from bypassing the Airforce minimum interval or daily limit. The queue claim function uses leases and `skip locked` semantics so concurrent workers do not process the same pending event simultaneously.

## Parad synchronization worker

The worker is implemented at `/api/internal/sync` in `src/app/api/internal/sync/route.ts`. Vercel invokes it every five minutes using `vercel.json`.

The worker performs the following sequence:

1. It validates `OMNIROUTE_SYNC_SECRET` or `CRON_SECRET`.
2. It claims a bounded queue batch with a five-minute visibility lease.
3. It derives a deterministic batch identifier from the sorted event IDs.
4. It inserts events into the Parad `ai_usage_events` table with `INSERT OR IGNORE`.
5. Parad upload is performed through the existing optimistic write mechanism.
6. Supabase events are marked `synced` only after the Parad upload succeeds.
7. Transient failures return events to `pending` for retry.
8. Events that reach five attempts become `dead_letter` records for inspection.

The deterministic batch identifier and idempotent event insertion prevent double counting after worker termination or duplicate execution.

## Deployment configuration

Required application variables remain:

```text
OMNIROUTE_AI_API_KEY
OMNIROUTE_VERCEL_PROFILE=ai-only
```

Supabase hot-path variables are:

```text
SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
```

The synchronization worker requires one of:

```text
OMNIROUTE_SYNC_SECRET
CRON_SECRET
```

The legacy Parad fallback and worker require the existing Parad variables, including `DATABASE_URL`, `PARADOX_PASSPHRASE`, and Parad authentication configuration. Provider variables remain server-side Vercel environment variables or server-side provider records.

## Database migration command

The repository includes `scripts/migrate-supabase.mjs` and the package command:

```bash
npm run db:migrate
```

The script executes the SQL transaction over PostgreSQL using one of these variables, in priority order:

```text
SUPABASE_DB_URL
POSTGRES_URL
POSTGRES_URL_NON_POOLING
DATABASE_URL
```

A direct PostgreSQL connection or non-pooling administrative connection is preferred for DDL. The migration script does not print credentials. The migration must be executed from an environment that actually has the Vercel/Supabase database connection variable; those deployment secrets are not automatically available inside a separate sandbox shell.

## Benchmark results

Three live streaming requests were sent to the deployed endpoint using `model: "auto"`, `routing_class: "agent-fast"`, and `stream: true`.

| Prompt | HTTP status | Selected provider | Selected model | Time to first byte | Total time |
|---:|---:|---|---|---:|---:|
| 1 | 200 | `kilo-gateway` | `nvidia/nemotron-3-super-120b-a12b:free` | 5,561 ms | 5,586 ms |
| 2 | 200 | `kilo-gateway` | `nvidia/nemotron-3-super-120b-a12b:free` | 4,341 ms | 4,736 ms |
| 3 | 200 | `kilo-gateway` | `nvidia/nemotron-3-super-120b-a12b:free` | 4,389 ms | 9,372 ms |

The average time to first byte was 4,764 ms. All requests returned HTTP 200 and streamed successfully. The measurement indicates that upstream provider startup time, rather than gateway serialization, is the dominant latency factor for this deployment. Streaming still improves perceived latency because output begins before the complete response is available.

## Validation and acceptance status

The implementation passed TypeScript validation and the Next.js production build. The compiled route inventory includes `/api/internal/sync`, `/api/v1/chat/completions`, and `/api/v1/models`.

The GitHub `main` branch contains the implementation and escalation commits. Automatic Vercel deployment is expected from the latest pushed `main` commit, subject to the Vercel project’s repository connection and deployment settings.

The remaining operational step is applying the Supabase migration in an environment containing the configured PostgreSQL connection variable. After migration, perform a smoke test for provider reads, policy authentication, atomic reservations, queue insertion, worker synchronization, retry recovery, and dead-letter transitions.

## Security notes

Gateway keys, provider keys, Supabase service-role keys, Parad credentials, and GitHub personal access tokens must never be committed or placed in client code. The GitHub token used during this task was supplied in chat and should be revoked and replaced. The gateway key used for benchmarking should also be rotated after testing.

## Repository files

| File | Purpose |
|---|---|
| `src/lib/vercel-ai-gateway/gateway.ts` | Provider selection, routing classes, deadlines, streaming, and fallback |
| `src/lib/supabaseGateway.ts` | Supabase cache, policy, queue, and atomic reservation adapter |
| `src/app/api/internal/sync/route.ts` | Secured five-minute Parad synchronization worker |
| `supabase/migrations/001_low_latency_gateway.sql` | Supabase schema and database functions |
| `scripts/migrate-supabase.mjs` | PostgreSQL migration runner |
| `vercel.json` | Five-minute cron declaration |
| `docs/LOW_LATENCY_ARCHITECTURE.md` | Approved architecture baseline |

## References

[1]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase PostgreSQL connection guidance"

[2]: https://supabase.com/docs/guides/queues "Supabase Queues documentation"

[3]: https://supabase.com/docs/guides/functions/background-tasks "Supabase background tasks documentation"

[4]: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package "Vercel Functions documentation"
