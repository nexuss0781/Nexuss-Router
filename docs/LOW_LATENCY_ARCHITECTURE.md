# OmniRoute Low-Latency Architecture

**Status:** Approved design baseline before implementation  
**Target:** Reduce gateway overhead for agentic workloads while preserving durable configuration, usage records, and Parad synchronization.

## Decision summary

The chat request path must not open, download, mutate, or upload a Parad database snapshot. Parad remains a durable archival and synchronization target, but it is removed from synchronous chat handling.

The recommended architecture is:

```text
Client
  |
  v
Vercel chat route
  |-- warm in-memory cache: providers, models, health, policy metadata
  |-- Supabase on cache miss or atomic decision: config, policy, limits, idempotency
  |-- upstream provider: strict deadline and streaming
  |
  +--> Supabase durable queue: usage, health, audit events
                                |
                                v
                    scheduled or persistent worker
                                |
                                v
               batch and synchronize with Parad every 5 minutes
```

The synchronous route performs only authentication, routing, upstream invocation, and response streaming. Usage logging, model catalog refresh, health updates, and Parad synchronization are asynchronous.

## Data-placement rules

| Data | Hot-path representation | Durable representation | Consistency requirement |
|---|---|---|---|
| Provider configuration | Warm memory cache | Supabase | Refresh on TTL or configuration version change |
| Model catalog | Warm memory cache | Supabase/configuration source | Eventual consistency is acceptable |
| Provider health/cooldowns | Memory for fast routing | Supabase or queue-derived state | Shared state required for global health decisions |
| API-key policy | Warm cache by key hash | Supabase | Short TTL plus explicit invalidation |
| Global rate limits | Atomic Supabase operation or dedicated counter store | Supabase | Strong consistency for quota enforcement |
| Usage events | Queue message | Supabase queue/table and Parad archive | Durable, asynchronous |
| Files and media | Object storage reference | Object storage | Never enlarge routing snapshots |
| Parad synchronization state | Worker state | Supabase batch/lease state | Retryable and idempotent |

Supabase should use a serverless-friendly transaction pooler for Vercel functions. Credentials must remain server-side. The browser must never receive provider credentials, Supabase service-role credentials, or the Parad API key.

## Request flow

### Cache hit

1. Validate the gateway token locally if the configured environment token is being used.
2. Read provider/model/policy data from the warm in-memory cache.
3. Select a route from a precomputed health-aware candidate table.
4. Start the upstream request with a route-specific deadline.
5. Stream the upstream response immediately when possible.
6. Enqueue a compact usage or health event without awaiting Parad.

### Cache miss

1. Query Supabase using the serverless transaction pooler.
2. Populate the warm cache with a short TTL and configuration version.
3. Continue through the same route flow.
4. If Supabase is unavailable, use a bounded stale cache where safe; fail closed for authorization and global quota decisions.

### Prohibited hot-path operations

The chat route must not call `listProviderConnections`, `listApiKeyPolicies`, `listModelOverrides`, `reserveProviderRequest`, or `recordAiUsageEvent` through the existing Parad snapshot repository implementation. These operations either become cached reads, atomic Supabase operations, or queue writes.

The chat route must not perform provider `/models` discovery synchronously. Catalog discovery runs asynchronously and updates the catalog cache.

## Agentic routing policy

The existing `auto` route should not be the latency-sensitive default. Introduce explicit routing classes:

| Class | Policy |
|---|---|
| `agent-fast` | Fastest verified model first, streaming enabled, one bounded fallback, short deadline |
| `agent-balanced` | Quality/latency compromise, one or two fallbacks |
| `quality` | Stronger models and longer deadline permitted |
| `auto` | Compatibility mode; not recommended for strict latency agents |

Fallback must be deadline-aware and bounded. A slow or unreachable first provider must not consume the full 240-second provider timeout before another provider is attempted. Long timeouts should remain limited to explicit long-running media or batch operations.

The gateway should maintain provider health and circuit-breaker state outside a per-instance JavaScript `Map`. A local map is useful as a fast hint, but it disappears on cold start and is inconsistent across concurrent Vercel instances.

## Five-minute Parad synchronization

Do not use `setInterval()` or local files as the durable mechanism on Vercel. A serverless instance can be frozen or terminated, and `/tmp` is not durable.

Each completed request emits a compact idempotent event to a Supabase durable queue:

```text
idempotency_key
provider_id
model
endpoint
status
latency_ms
input_tokens
output_tokens
created_at
```

A worker runs at least every five minutes and performs the following transaction:

1. Claim a bounded batch using a lease and visibility timeout.
2. Aggregate or compact events by time window, provider, model, and endpoint.
3. Upload one consolidated batch to Parad.
4. Record the Parad version and synchronization timestamp.
5. Mark the events complete only after successful upload.
6. Retry transient failures with exponential backoff.
7. Move permanently failing records to a dead-letter state for inspection.

The batch writer must be idempotent. Replaying a batch after a worker crash must not double-count usage. Use a deterministic batch ID derived from the event IDs or a persisted batch record.

Supabase Queues is preferred over a detached in-memory array because it provides durable delivery and supports background processing. A post-response task may enqueue the event quickly, but queue persistence—not the detached task itself—is the durability boundary.

## Background execution options

| Option | Use when | Main risk |
|---|---|---|
| Vercel post-response task | Small, non-critical enqueue or analytics side effect | Execution is still bounded by the function lifecycle |
| Supabase Queue plus scheduled worker | Durable usage and five-minute Parad synchronization | Requires queue schema, leases, and worker deployment |
| Always-on worker process | High volume, strict retry control, or continuous processing | Additional hosting and operations |

The default implementation should use a Supabase queue and a scheduled worker. A persistent worker is warranted only when queue throughput, continuous processing, or execution limits exceed the managed scheduled-worker design.

## Migration sequence

### Phase 1: instrumentation

Add structured timings for cache lookup, Supabase lookup, route selection, upstream time to first byte, total upstream time, queue enqueue, and Parad batch upload. Preserve provider and model response headers for diagnostics.

### Phase 2: operational state

Create Supabase tables for provider configuration, API-key policies, provider health, idempotency keys, usage events, Parad batches, and worker leases. Add indexes for active providers, key hashes, event status, and lease expiration.

### Phase 3: warm cache

Load provider configuration, model catalog, and safe policy metadata once per warm instance. Use TTLs and a configuration-version field. Do not cache secrets in client-visible responses.

### Phase 4: asynchronous accounting

Replace synchronous usage persistence with queue enqueue. Return the non-streaming response immediately after upstream completion. For streams, observe completion and enqueue a final usage event without delaying token delivery.

### Phase 5: routing policy

Add `agent-fast`, `agent-balanced`, and `quality` route classes. Use strict per-class deadlines, bounded fallback, provider circuit breakers, and asynchronous catalog refresh.

### Phase 6: Parad worker

Implement the five-minute batch worker with leases, idempotency, retries, dead-letter handling, and batch-size limits. Keep large files outside the synchronization database.

### Phase 7: load validation

Benchmark explicit fast-model requests, automatic success, automatic fallback, streamed responses, cache hits, Supabase cache misses, and concurrent traffic. Report p50, p95, p99, time to first byte, total time, fallback count, queue lag, and Parad batch success rate.

## Initial latency objectives

| Metric | Initial objective |
|---|---:|
| Warm gateway overhead before upstream | <50 ms |
| In-memory route selection | <5 ms |
| Supabase cache miss | <100–250 ms, region-dependent |
| Queue enqueue | <50–150 ms, region-dependent |
| User-visible Parad overhead | 0 ms |
| Automatic fallback attempts for agent-fast | At most 1 fallback |
| Agent-fast provider deadline | 2–4 seconds per route, subject to measurement |

These are gateway objectives, not guarantees for model inference. Completed LLM responses cannot reliably be milliseconds when the provider itself requires seconds. Streaming and a genuinely fast provider are required for low time-to-first-token.

## Acceptance criteria before production use

The migration is complete only when chat requests no longer download or upload Parad snapshots, successful responses do not await usage persistence, provider catalog discovery is absent from the hot path, fallback is bounded by a deadline, and the five-minute worker can recover from duplicate execution, transient Parad failure, and worker termination without data loss or double counting.

## References

[1]: https://supabase.com/docs/guides/database/connecting-to-postgres "Supabase connection and pooling guidance"

[2]: https://supabase.com/docs/guides/queues "Supabase Queues documentation"

[3]: https://supabase.com/docs/guides/functions/background-tasks "Supabase background tasks documentation"

[4]: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package "Vercel Functions and Next.js post-response work"
