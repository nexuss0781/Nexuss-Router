# Provider & Model Admission Criteria

**Nexuss AI Router (NAR)** — the standard every upstream provider and every individual model must satisfy before it is admitted to the router.

This document is the contract. It is used to evaluate submissions, to justify admissions and rejections, and to define what "supported" means to the people building on the gateway.

Related: **[Contributing to Nexuss AI Router](CONTRIBUTING.md)** — how to submit, and what the program offers in return.

---

## 1. Purpose and scope

NAR routes live traffic. That imposes a stricter bar than "the API works once":

- A client must never receive a provider credential, an upstream error string, or a malformed completion.
- A provider that degrades must fail in a way the router can detect and route around.
- Anything advertised in the catalog must be something we can actually serve, at a quality and latency we can characterize.

Two objects are evaluated separately, and both must pass:

| Object | Question it answers |
|---|---|
| **Provider** | Is this upstream safe, stable, and contractually usable as a routing target? |
| **Model** | Is this specific model capable, characterized, and honest about what it supports? |

A model is admitted only if its provider is admitted. A provider can be admitted with an empty model list while its catalog is characterized.

## 2. Decision tiers

| Tier | Meaning | Routing eligibility |
|---|---|---|
| **Core** | All hard requirements met, all provider criteria verified, model fully characterized | Eligible for `auto`; may lead the pool |
| **Candidate** | Hard requirements met; some model-level evidence still being collected | Eligible for explicit model IDs; may enter `auto` after its model rows are curated |
| **Experimental** | Admitted on contributor attestation; not yet independently verified | Explicit IDs only; excluded from `auto` ranking and demoted for tool requests |
| **Declined** | Fails a hard requirement | Not admitted |

Tier is a property of a **provider/model pair**, not of a provider alone.

## 3. Evidence standard

Every criterion marked **Verified** below requires recorded evidence. A claim without evidence is a claim, not a verification.

| Requirement | Minimum standard |
|---|---|
| Sample size | ≥20 requests per model, spread across ≥3 observation windows at different times of day |
| Reproducibility | The probe is a committed, re-runnable script; evidence includes the script version |
| Recency | Evidence is ≤30 days old at admission; re-verification every 90 days thereafter |
| Provenance | Cited upstream documentation URL, or a recorded live probe with request/response samples |
| Honesty | Self-reported numbers are labeled as self-reported until independently reproduced |

Verified criteria are re-checked on a rolling basis. Silent drift is treated as a failure of the criterion, not a change of criteria.

---

# Part A — Provider criteria

## A1. Protocol compatibility

| ID | Requirement | Verified |
|---|---|---|
| A1.1 | OpenAI-compatible `POST /v1/chat/completions` (or a documented adapter that maps cleanly) | Yes |
| A1.2 | Streaming via SSE with `data:` frames and a terminating `[DONE]` | Yes |
| A1.3 | `system` role, multi-turn history, `temperature`/`max_tokens`/`stop` passthrough | Yes |
| A1.4 | `tools` / `tool_calls` supported, or the model is explicitly registered as non-tool-aware | Yes |
| A1.5 | Stable, versioned base URL; no undocumented per-request host rotation | Yes |
| A1.6 | Errors return meaningful HTTP status codes **and** a machine-readable body | Yes |
| A1.7 | Documented behavior for unknown models, and for context-length overflow | Yes |

## A2. Rate limits and quota

This is the section that decides most applications, because a shared serverless gateway and a consumer chat app have fundamentally different traffic shapes.

| ID | Requirement | Verified |
|---|---|---|
| A2.1 | A **numeric** rate limit is published, at a scope stated in writing | Yes |
| A2.2 | The limit scope is **per-key or per-account** | Yes |
| A2.3 | Burst ceiling and maximum concurrency are documented | Yes |
| A2.4 | Remaining quota and reset time are exposed in response headers (`x-ratelimit-*`, `retry-after`) where possible | Yes |
| A2.5 | Quota exhaustion returns `429` with a usable `Retry-After` | Yes |
| A2.6 | Reset cadence documented: rolling window vs fixed window | Yes |
| A2.7 | No silent queueing or undisclosed degradation | Yes |

> **A2.2 is the clause that disqualifies most free tiers.** A per-IP limit on a serverless deployment is not a per-client limit — it is a *global* cap shared by every request from the platform's egress range, and egress addresses are not stable or attributable. A provider offering only a per-IP free tier can be admitted at **Candidate** at best, with the effective ceiling documented, and may never be eligible to lead the pool.

## A3. Reliability and failure semantics

| ID | Requirement | Verified |
|---|---|---|
| A3.1 | Overload and capacity conditions are reported as explicit, detectable errors | Yes |
| A3.2 | An error is never delivered as a `200` with an incomplete or malformed body | Yes |
| A3.3 | Content is never silently truncated; finish reasons are accurate | Yes |
| A3.4 | Availability history or a status page exists, or an uptime claim is self-reported and labeled | Yes |
| A3.5 | Maintenance and deprecation windows are announced | Yes |
| A3.6 | An incident or status feed is available for automated health signal | Recommended |

## A4. Latency

| ID | Requirement | Verified |
|---|---|---|
| A4.1 | Measured TTFT and total latency at p50 and p95, with sample size and window stated | Yes |
| A4.2 | Tail latency is bounded; p95 is not dominated by multi-minute stalls | Yes |
| A4.3 | Cold-start and queueing behavior documented | Yes |
| A4.4 | Timeouts are the client's to set; the provider does not hold connections open indefinitely | Yes |

## A5. Security, privacy, and compliance

| ID | Requirement | Verified |
|---|---|---|
| A5.1 | Credential is a server-side secret; provider supports programmatic key rotation | Yes |
| A5.2 | Data retention and training-use policy published | Yes |
| A5.3 | Regional availability documented, if regionally constrained | Yes |
| A5.4 | Acceptable-use and content policy compatible with third-party redistribution of responses | Yes |
| A5.5 | No requirement that end-user PII be transmitted to satisfy the API | Yes |
| A5.6 | No client-side key exposure requirement | Yes |

## A6. Economics and access

| ID | Requirement | Verified |
|---|---|---|
| A6.1 | A free tier exists and is usable without a payment method | Yes |
| A6.2 | No credit card, deposit, or paid commitment required to reach the free tier | Yes |
| A6.3 | No metered billing that can surprise an operator | Yes |
| A6.4 | Upgrade path documented, but not required for admission | Recommended |
| A6.5 | Free-tier limits do not require joining a paid program or inviting downstream users | Yes |

## A7. Operational integration

| ID | Requirement | Verified |
|---|---|---|
| A7.1 | Key supplied through an environment variable; never compiled into a client | Yes |
| A7.2 | Provider identity is stable enough to key cooldown and telemetry state on | Yes |
| A7.3 | A named technical contact or issue tracker exists for escalations | Yes |
| A7.4 | Model list is discoverable via `GET /v1/models` or a published, parseable list | Yes |

## A8. Provider identity and governance

| ID | Requirement | Verified |
|---|---|---|
| A8.1 | Named operator and contactable representative | Yes |
| A8.2 | Terms of service published, and permit automated API use | Yes |
| A8.3 | Terms do not prohibit gateway aggregation or redistribution of responses | Yes |
| A8.4 | Rate limits are not a pretext to prohibit public documentation of the service | Recommended |

---

# Part B — Model criteria

## B1. Identity and catalog hygiene

| ID | Requirement | Verified |
|---|---|---|
| B1.1 | Stable model ID with a documented versioning scheme | Yes |
| B1.2 | Context window and maximum output tokens published | Yes |
| B1.3 | Model appears in the provider's discoverable catalog | Yes |
| B1.4 | Retirements and ID migrations announced before they occur | Yes |
| B1.5 | Model is not an alias that silently changes behavior between calls | Yes |

## B2. Declared capability metadata

Every admitted model carries a complete metadata row. The enumerated values below are the router's own taxonomy; a value outside the set is rejected until the taxonomy is extended.

| Field | Accepted values |
|---|---|
| `family` | Model family attribution |
| `modality` | `text-chat`, `text-chat-vision-candidate`, `embeddings`, `image-generation`, `audio-generation`, `video-generation`, `music-generation`, `moderation-safety`, `specialized` |
| `task_role` | `general-chat`, `coding`, `reasoning-general`, `vision`, `safety-classification`, `music-generation`, `image-creation`, `audio`, `unknown` |
| `quality_tier` | `strong-candidate`, `curated-gateway`, `curated-free`, `community-experimental`, `specialized`, `unclassified` |
| `priority` | `P1-curated-free`, `P2-curated-gateway`, `P3-strong-candidate`, `P4-broad-community`, `P-specialized` |
| `confidence` | `high`, `medium`, `low` |
| `taxonomy_source` | Provenance of the row |

| ID | Requirement | Verified |
|---|---|---|
| B2.1 | All fields populated; no blanks | Yes |
| B2.2 | `modality` is declared, not inferred from the model name alone | Yes |
| B2.3 | Vision capability is declared explicitly, never assumed | Yes |
| B2.4 | Tool awareness is declared explicitly, never assumed | Yes |
| B2.5 | Context window in the row matches the provider's current documentation | Yes |

## B3. Tool-calling conformance

Tool support is graded, because "supports tools" covers everything from a model that emits malformed JSON to one that reliably drives a multi-turn agent loop.

| Level | Definition | Eligibility |
|---|---|---|
| **L0** | No tool support; tool requests are refused or answered as prose | Excluded from tool routes; may serve `auto` for plain chat |
| **L1** | Emits tool intent as text; recoverable by a tolerant parser | Tool routes only with telemetry demotion |
| **L2** | Native `tool_calls`, single function, correct JSON arguments | Full tool eligibility |
| **L3** | Native, parallel/multiple tool calls in one turn | Full tool eligibility, preferred |
| **L4** | L3 plus reliable multi-turn continuation when the conversation is pinned to the same model | Preferred lead for tool traffic |

| ID | Requirement | Verified |
|---|---|---|
| B3.1 | Conformance level assigned by probe, not by documentation claim | Yes |
| B3.2 | Tool arguments are schema-valid, including nested objects and arrays | Yes |
| B3.3 | `finish_reason` correctly signals a tool call | Yes |
| B3.4 | Continuation after a tool result does not lose the conversation | Yes |
| B3.5 | Explicit `"tools": null` is treated as absent rather than as an error | Yes |

## B4. Vision and modality verification

| ID | Requirement | Verified |
|---|---|---|
| B4.1 | A declared vision model successfully accepts an image input part | Yes |
| B4.2 | The response demonstrably reflects image content, not just a valid envelope | Yes |
| B4.3 | Declared non-vision models are confirmed to reject or ignore image parts cleanly | Yes |
| B4.4 | Declared modalities beyond text are probed once per modality at admission | Yes |
| B4.5 | Vision-capable models are marked `text-chat-vision-candidate` only after a successful probe | Yes |

## B5. Latency profile

| ID | Requirement | Verified |
|---|---|---|
| B5.1 | TTFT p50 and p95 measured for the model specifically | Yes |
| B5.2 | Total latency p50 and p95 measured | Yes |
| B5.3 | Measured under a defined concurrency, recorded alongside the numbers | Yes |
| B5.4 | Profile is within the provider-level envelope or the deviation is documented | Yes |

## B6. Quality evidence

| ID | Requirement | Verified |
|---|---|---|
| B6.1 | Deterministic instruction-following score from a fixed prompt set, with exact expected output | Yes |
| B6.2 | `quality_tier` is assigned from that evidence, not from marketing copy | Yes |
| B6.3 | Tool-argument correctness scored separately from prose quality | Yes |
| B6.4 | Format compliance measured: does the model return exactly the requested shape | Yes |
| B6.5 | Language coverage noted if the model is multilingual | Recommended |

## B7. Stability and health history

| ID | Requirement | Verified |
|---|---|---|
| B7.1 | Rolling request success rate measured over the observation window | Yes |
| B7.2 | Frequency and duration of overload windows recorded | Yes |
| B7.3 | Per-model quota documented where it differs from the provider limit | Yes |
| B7.4 | Per-model concurrency ceiling documented | Yes |
| B7.5 | The model behaves as a routing target under concurrency, not only at low load | Yes |

---

# Part C — Hard requirements

These are non-negotiable. A provider that fails any one of them is declined at admission and is subject to review if it fails later.

1. **A2.1 / A2.2** — a numeric rate limit, scoped per key or per account. Undocumented or per-IP-only free tiers cannot lead the pool.
2. **A1.1 / A1.2** — OpenAI-compatible chat completions with working SSE streaming.
3. **A3.1 / A3.2** — failures are machine-detectable. A provider that signals errors as successful responses is not routable.
4. **A6.1 / A6.2** — a genuinely free tier that requires no payment method.
5. **A5.6 / A7.1** — server-side credentials only.
6. **A8.3** — terms permit gateway aggregation.
7. **B2.1** — a complete metadata row exists before the model is catalogued.

## 4. Admission matrix

| Provider criteria | Model criteria | Outcome |
|---|---|---|
| All hard requirements + all verified | Complete, B3 ≥ L2 | **Core** |
| All hard requirements + all verified | Complete, B3 = L1, or B4/B5 pending | **Candidate** |
| All hard requirements met on attestation only | Partial | **Experimental** |
| Any hard requirement unmet | Any | **Declined** |

## 5. Lifecycle

```text
intake ──► evaluation ──► admission ──► monitoring ──► re-verification
              │                              │                │
              └── declined                    └── demoted      └── promoted / sunset
```

1. **Intake** — a submission is opened as an issue using the provider submission template, referencing this document.
2. **Evaluation** — the probe suite runs; evidence is attached. A submission without evidence is returned as Experimental, not rejected.
3. **Admission** — registry entry, env-key mapping, and metadata rows are added together in one change. A provider with no verified model rows stays out of the catalog.
4. **Monitoring** — success rate, latency, and failure codes feed route health continuously. Degradation is visible before users feel it.
5. **Re-verification** — every 90 days, re-run the probe suite. Failure moves the pair down a tier; Core pairs are re-verified on a 30-day cadence during their first quarter.
6. **Promotion** — a Candidate becomes Core when its outstanding model evidence is complete.

## 6. Review and sunset criteria

A provider or model is reviewed when any of the following is observed:

- A hard requirement is no longer met.
- The rate limit becomes undocumented, or shifts to a per-IP scope.
- Authentication failures exceed 5% of attempts over a rolling window.
- Success rate falls below 90% over a rolling window with no recovery.
- The provider retires the model or changes its ID without a migration path.
- Terms change to prohibit gateway aggregation.
- A security or privacy incident is reported by the provider or observed by us.

Sunset is staged: the model is marked deprecated, removed from `auto` ranking, retained for explicit requests for a grace period, and only then removed. Clients depending on an explicit model ID are not broken without notice.

## 7. Governance

- This document is the standard of record. Changes require a pull request with rationale and a migration note for any affected registry or metadata rows.
- Criteria changes never retroactively demote a healthy provider without a re-verification cycle.
- Every admission decision cites the criterion or criteria that decided it.
- Contributors may propose taxonomy extensions; a value is only added to the accepted sets when at least one model needs it.

## Appendix A — Submission manifest

Providers are declared in one table. A submission provides the equivalent of:

```ts
{
  id: "provider-id",                      // stable, used as the cooldown key
  baseUrl: "https://api.provider.com/v1", // versioned, no host rotation
  format: "openai",
  priority: 980,
  models: ["model-id"],
}
```

with a server-side key mapping:

```ts
{
  providerId: "provider-id",
  apiKeyNames: ["OMNIROUTE_PROVIDER_API_KEY"],
  baseUrlNames: ["OMNIROUTE_PROVIDER_BASE_URL"],
  modelsNames: ["OMNIROUTE_PROVIDER_MODELS"],
}
```

and one metadata row per model:

```ts
{
  "provider-id/model-id": {
    family: "...",
    modality: "text-chat",
    task_role: "general-chat",
    quality_tier: "curated-gateway",
    priority: "P2-curated-gateway",
    confidence: "medium",
    taxonomy_source: "live-omniroute",
  },
}
```

## Appendix B — What a submission must include

1. Provider name, operator, and technical contact.
2. Base URL and authentication method.
3. Published rate limits, with scope and reset cadence — or an explicit statement that none are published.
4. Terms-of-service URL, and confirmation that gateway aggregation is permitted.
5. Full model list with context windows.
6. Declared modality and tool support per model.
7. Probe evidence: scripts plus results, meeting the standard in section 3.
8. Confirmation that the free tier requires no payment method.
