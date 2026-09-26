# OpenRouter — Provider Dossier

**Status:** Not admitted — evaluation target · **Evaluated:** 2026-09-25 · **In code:** no

OpenRouter aggregates many upstream providers behind one OpenAI-compatible API and
publishes a free tier under `:free` model variants. This dossier records what was
measured directly against the live API, so that admission can be decided on evidence
rather than on the catalog's own claims.

Per [Provider & Model Admission Criteria](../../CRITERIA.md), OpenRouter is assessed
against sections A (provider) and B (model). Verdict summary:

| Criterion | Result |
|---|---|
| A2 Rate limits — numeric, documented, account-scoped | **Pass** |
| A2 Machine-readable quota | **Pass, with lag** |
| A3 Reliability | **Conditional** — per-model upstream saturation |
| A4 Latency | **Mixed** — bimodal, severe slow tail |
| B3 Tool conformance | **Pass for 8 of 17** |
| B4 Vision | Declared, not independently verified |
| Hard requirement: free tier without payment | **Pass** at base tier |

Overall: **Not yet admitted; selected as an evaluation target.** The binding constraints are
the hard requirements in `CRITERIA.md`, not capability and not the daily cap. A1.2 (streaming)
and A8.3 (gateway-aggregation terms) are unverified, B2 is incomplete, and the §3 evidence bar
is unmet, so no model here currently qualifies. The 50-per-day cap only shapes the tier this
would occupy *if* it is admitted: a low-priority overflow route, not a general routing backend.

---

## 1. Integration shape

| | |
|---|---|
| Base URL | `https://openrouter.ai/api/v1` |
| Format | `openai` (chat completions) |
| Auth | `Authorization: Bearer <key>` |
| Recommended headers | `HTTP-Referer: <app url>`, `X-Title: <app name>` |
| Proposed env vars | `OMNIROUTE_OPENROUTER_API_KEY`, `OMNIROUTE_OPENROUTER_BASE_URL`, `OMNIROUTE_OPENROUTER_MODELS` |
| Proposed provider id | `openrouter` |

Env var names follow the existing `OMNIROUTE_<PROVIDER>_*` convention already used by
`kilo-gateway`.

OpenRouter requires no custom request shape. It is a strict superset of the OpenAI chat
completions API, so it needs no new wire format, no new parser, and no new streaming
path in the gateway.

## 2. Rate limits — measured

Documented limits, confirmed against the live API:

| Credits purchased (all time) | Requests/min | Requests/day |
|---|---|---|
| < $10 | 20 | 50 |
| ≥ $10 | 20 | 1000 |

A free-tier key reported `is_free_tier: true` with `free_model_daily_requests: {used: 0,
limit: 50, remaining: 50}` before any traffic, matching the table exactly. The base tier
requires no payment method or paid commitment, satisfying the hard requirement in A1.
The 1000/day tier requires a $10 purchase and therefore sits outside the free-tier
commitment; the base 50/day tier is what qualifies.

**Additional accounts and API keys do not raise these limits.** OpenRouter governs
capacity globally, so the ceiling is per account, not per key.

### The minute ceiling is burst-tolerant

A burst of 30 concurrent requests against a single model produced:

| Outcome | Count |
|---|---|
| 200 OK | 27 |
| 429 `Rate limit exceeded: free-models-per-min.` | 3 |
| Sustained rate achieved | **111 req/min** against a documented 20/min cap |

The limit is real, self-identifying, and machine-readable, but it is not a strict wall.
A gateway must not assume that staying under 20/min is unnecessary, and equally must not
assume that exceeding it is fatal. Treat 20/min as the steady-state design figure and
expect the limiter to absorb modest bursts.

### Rate-limit headers

Present **only on 429 responses**. Successful inference responses carry none.

| Header | Observed value |
|---|---|
| `x-ratelimit-limit` | `20` |
| `x-ratelimit-remaining` | `0` |
| `x-ratelimit-reset` | epoch milliseconds (reset horizon observed at ~147s) |

`Retry-After` was **not** sent on any 429. A client must therefore parse
`x-ratelimit-reset` and schedule its own retry; there is no server-supplied backoff hint
to rely on.

### 2.1 Two distinct 429 classes — do not conflate

Both arrive as HTTP 429 but require opposite handling. The message body distinguishes them:

| Message | Meaning | Correct response |
|---|---|---|
| `Rate limit exceeded: free-models-per-min.` | Platform cap reached; our whole account budget for the window is spent | Stop routing to this provider. Retry after `x-ratelimit-reset`. No model will succeed. |
| `Provider returned error … <model> is temporarily rate-limited upstream. Please retry shortly` | That one model is saturated at its upstream | Keep the provider healthy. Cooldown **that model only** and route to a different model. |

Collapsing these into a single provider-level cooldown would take the entire provider out
of rotation because one model is busy. This is the single most important integration rule
this dossier establishes.

### 2.2 The daily counter is eventually consistent

`GET /api/v1/key` exposes `free_model_daily_requests: {used, limit, remaining}`, reset at
UTC midnight, with the tier selected by all-time credits purchased.

It is **accurate but lagged**. Mid-probe it read `used: 19` while 45 successful
completions had already been received; roughly 90 seconds later it read `used: 46`. Final
tally was 46 counted against 45 observed completions — within one request.

Operational guidance: poll this endpoint on a health interval and accept up to ~90s of
staleness. Never gate a single routing decision on one instantaneous read, and expect the
final exhaustion reading to lag the first 429s that follow it.

## 3. Free model roster

17 `:free` variants, all verified zero-priced on both `prompt` and `completion`. 16
declare tool support, 8 declare non-text input modalities, all have ≥64k context. 66
upstream endpoints sit behind them.

| Model | ctx | max out | tools | tool_choice | structured | reasoning | vision | in_mod |
|---|---|---|---|---|---|---|---|---|
| cohere/north-mini-code:free | 256k | 64k | Y | Y | – | Y | – | text |
| dots-studio/dots-3-note-preview:free | 512k | 460k | Y | Y | Y | Y | Y | text,image |
| google/gemma-4-26b-a4b-it:free | 262k | 32k | Y | Y | – | Y | Y | image,text,video |
| google/gemma-4-31b-it:free | 262k | 32k | Y | Y | – | Y | Y | image,text,video |
| inclusionai/ling-3.0-flash-fin:free | 262k | 32k | Y | Y | – | Y | – | text |
| inclusionai/ling-3.0-flash-sante:free | 262k | 32k | Y | Y | – | Y | – | text |
| liquid/lfm-2.5-2.6b:free | 65k | 8k | Y | Y | Y | Y | – | text |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 256k | 64k | Y | Y | – | Y | Y | text,audio,image,video |
| nvidia/nemotron-3-super-120b-a12b:free | 262k | 235k | Y | Y | Y | Y | – | text |
| nvidia/nemotron-3-ultra-550b-a55b:free | 1M | 64k | Y | Y | – | Y | – | text |
| nvidia/nemotron-3.5-content-safety:free | 128k | 8k | – | – | – | Y | Y | text,image |
| nvidia/nemotron-3.5-lightning:free | 1M | 64k | Y | Y | – | Y | – | text |
| poolside/laguna-s-2.1:free | 262k | 32k | Y | Y | – | Y | – | text |
| poolside/laguna-xs-2.1:free | 262k | 32k | Y | Y | – | Y | – | text |
| qwen/qwen3.8-27b:free | 262k | 235k | Y | Y | Y | Y | Y | text,image,video |
| thinkingmachines/inkling-small:free | 1.05M | 262k | Y | – | – | Y | Y | text,image,audio |
| thinkingmachines/inkling:free | 1.05M | 262k | Y | – | – | Y | Y | text,image,audio |

`openrouter/free` is also zero-priced and tool-capable at 200k context. It is a dynamic
router across free models rather than a fixed model, and is tracked separately as an
Experimental entry.

## 4. Catalog metadata — no probing required

`GET /api/v1/models` (458 models, ~751KB) is **unauthenticated** and returns per model:
`context_length`, `architecture.input_modalities` / `output_modalities`, `pricing`,
`top_provider.max_completion_tokens`, `supported_parameters`, `per_request_limits`,
`default_parameters`, `expiration_date`, `knowledge_cutoff`, `reasoning.mandatory`,
`reasoning.default_enabled`, and `benchmarks` on 251 of 458 models.

`GET /api/v1/models/{author}/{slug}/endpoints` is also unauthenticated and adds
per-upstream-provider `uptime_last_5m` / `_30m` / `_1d`, `status`, `quantization`,
`context_length`, `max_prompt_tokens`, `supports_tool_choice`, `supports_image_reference`,
`supports_implicit_caching`, and `provider_name`.

Across the free set, `uptime_last_30m` had a median of 99.87 and a minimum of 87.90.

This satisfies much of B2, B4, and B5 declaratively, and A3 partially, without a test
harness. A metadata sync job can populate the registry from these two endpoints.

**Honest gaps.** `latency_last_30m` and `throughput_last_30m` are `null` on every one of
the 66 free endpoints when queried unauthenticated, so A4 speed data is not obtainable
this way and must be measured by probe. The fine-grained `tool_choice` matrix
(`auto` / `none` / `required` / `function` tested individually) is not exposed
unauthenticated; only the coarser `supports_tool_choice` boolean is. Both may be available
with an authenticated request — untested, see §8.

## 5. Tool conformance — measured

Probed with a single `get_weather(city)` function and a forced
`tool_choice: {type: "function", function: {name: "get_weather"}}`. Eight models returned
exact arguments `{"city": "Paris"}`:

cohere/north-mini-code · dots-studio/dots-3-note-preview · inclusionai/ling-3.0-flash-fin ·
inclusionai/ling-3.0-flash-sante · liquid/lfm-2.5-2.6b ·
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning · nvidia/nemotron-3-ultra-550b-a55b ·
poolside/laguna-xs-2.1

Failures were diagnostic rather than uniform:

| Model | Result | Meaning |
|---|---|---|
| nvidia/nemotron-3.5-content-safety:free | `404 No endpoints found that support tool use` | Catalog honesty confirmed — `supported_parameters` had tools absent and the API agreed exactly. |
| nvidia/nemotron-3.5-lightning:free | 200 OK, 34.9s, **no tool call** | Formatting failure. Emitted `content: "We"` and exhausted the token budget without calling the function. |
| gemma-4-26b, gemma-4-31b, qwen3.8-27b, laguna-xs / laguna-s | 429 upstream-saturated | Transient; several succeeded on other attempts. |
| thinkingmachines/inkling, inkling-small | `403 only available on agentic harnesses` | Hard-excluded, see §6. |

`nvidia/nemotron-3.5-content-safety` is a useful data point for the criteria: the
published `supported_parameters` correctly predicted a capability the model does not
have. Prefer the catalog over the display name.

## 6. Coverage and failure taxonomy

One request per free model produced 10 usable and 7 not, in three distinct classes:

| Class | Models | Handling |
|---|---|---|
| 200 OK | 10 | Admit |
| 429 upstream-saturated | gemma-4-26b-a4b-it, gemma-4-31b-it, laguna-xs-2.1, qwen3.8-27b | Per-model cooldown, retry, route around |
| 403 `only available on agentic harnesses` | thinkingmachines/inkling, inkling-small | Exclude. Note these advertise 1.05M context and tool support, so they look attractive in a catalog listing while being unserviceable. |
| 200 with error envelope inside | nvidia/nemotron-3-nano-omni-30b-a3b-reasoning | See §7 |

Upstream saturation is dynamic and model-specific. `poolside/laguna-s-2.1` succeeded in
the coverage pass and was saturated minutes later; `laguna-xs-2.1` did the reverse. It
should be modeled as a short per-model cooldown, never as a static disable.

## 7. Integration requirements

### 7.1 HTTP 200 error envelopes must be detected

Two models returned **HTTP 200** with an error object in the body and `finish_reason: null`:

```json
{ "message": "Upstream error from Nvidia: ResourceExhausted: Worker local total request limit reached (16/16)", "code": 503 }
{ "message": "Upstream error from Nvidia: Service temporarily overloaded", "code": 503 }
```

A client that branches only on HTTP status treats these as successes with empty content
and bills them as healthy traffic. The gateway's existing HTTP-200 error-envelope
detection covers this case and is required to stay enabled for this provider. Both
observed shapes carry a `code` field distinct from the HTTP status.

### 7.2 The `reasoning` field is always present

Every tool-capable free model returned a `message.reasoning` field (98–430 chars observed)
alongside `content` and `tool_calls`. In plain chat mode several models returned
`content: null` with the substantive output living in `reasoning`.

Consequences:

- Tool-call parsing must read `message.tool_calls` and ignore `reasoning`.
- Content extraction must not treat a null `content` with populated `reasoning` as an
  empty response.
- `reasoning.default_enabled: true` is set on several free models, so reasoning runs unless
  explicitly disabled. Left alone it is expensive: see §7.3.

### 7.3 Latency is bimodal with a severe slow tail

Same trivial single-word prompt:

| Model | Observed |
|---|---|
| poolside/laguna-xs-2.1 | 0.8s |
| nvidia/nemotron-3-ultra-550b-a55b | 0.9s – 3.0s |
| cohere/north-mini-code | 1.1s – 1.2s |
| liquid/lfm-2.5-2.6b | 1.2s – 1.7s |
| nvidia/nemotron-3-super-120b-a12b | 21.4s |
| nvidia/nemotron-3.5-lightning | 34.9s (tool) / 90.6s (chat) |

`nvidia/nemotron-3.5-lightning` is both the slowest model and the one that failed to emit
its tool call, which links the slow tail directly to unbudgeted reasoning. Admitting it
without an explicit reasoning budget would put a 90-second path in the routing pool.

### 7.4 Quota-gated admission

The provider should be admitted with:

- Quota polled from `free_model_daily_requests.remaining` on the health interval.
- The provider marked unavailable at zero remaining, rather than spending requests to
  discover the cap.
- Lowest routing priority — overflow only, never the default target.
- Per-model cooldown on `is temporarily rate-limited upstream`; provider-wide cooldown on
  `free-models-per-min`.
- Explicit reasoning disable or budget on models advertising `default_enabled`.

## 8. Not yet tested

Recorded so the gaps are visible rather than assumed:

- Whether `latency_last_30m` and `throughput_last_30m` populate with an authenticated
  request. All 66 free endpoints returned `null` unauthenticated.
- The `tool_choice` value matrix (`auto`, `none`, `required`, `function`) per model. Only
  the forced `function` variant was exercised, which is the strictest case.
- Streaming behavior, including mid-stream error delivery. OpenRouter documents that a
  rate limit or provider error arriving after headers are sent surfaces as an SSE event
  with `finish_reason: "error"` rather than an HTTP status.
- Whether the 1000/day tier behaves differently in any way beyond the counter value.
- Exact 429 RPM boundary under sustained load. The burst of 30 established that the
  limiter engages and that it is burst-tolerant, not where the precise edge sits.
- Multi-modal input, image and audio payloads, and structured-output fidelity.
- Vision capability was taken from `input_modalities` and was not independently verified
  by sending an image.

## 9. Method

Three phases against the live API on 2026-09-25, using a free-tier key:

1. **Coverage** — one minimal non-streaming request per free model, 17 requests.
2. **Tool usage** — one forced function call per free model, 17 requests, capturing
   `tool_calls`, `reasoning`, and raw bodies.
3. **Rate limit** — 30 concurrent requests to a single fast model, capturing status
   distribution and all `x-ratelimit-*` headers.

45 successful completions were returned; 46 requests were counted against the daily cap.
Model inventory and capability flags were taken from the unauthenticated catalog, and
per-endpoint uptime from the unauthenticated endpoints API.

No credential is recorded in this dossier or anywhere in the repository. The probe key is
held outside the working tree and is rotated after evaluation.

## 10. Recommendation

Do not admit yet. Admit as a lowest-priority overflow tier, subject to §7, once A1.2, A8.3,
B2, and the §3 evidence bar are all closed. The eight models in §11 are the evaluation
targets, not a qualified roster; each carries `confidence: low` until its own evidence
campaign is committed and passed.

OpenRouter is the best-evidenced free source evaluated so far. It is the first provider to
satisfy A2 outright — a numeric, account-scoped, documented limit with a machine-readable
counter — and the only one whose per-upstream uptime, quantization, and tool support are
published as live, queryable data rather than asserted in prose. That makes it valuable
beyond its own 50 requests per day: the catalog and endpoints APIs are a reusable
verification source for models served by other providers.

The quota is genuinely small, so the value is in coverage, evidence quality, and overflow
availability rather than throughput.


## 11. Selected evaluation targets

These eight are the models chosen to evaluate OpenRouter against `CRITERIA.md`. They are
**targets, not a qualified roster** — every one carries `confidence: low` until its own
evidence campaign meets the §3 bar in the criteria document. Rich records, including each
provider's verbatim catalog description, live in `src/lib/vercel-ai-gateway/openrouterCatalog.ts`.

| Model | Owner | Tier | Context | Modalities | Quantization | Upstreams (live) | Routable | Flags |
|---|---|---|---|---|---|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | NVIDIA | P1 general reasoning | 1,000,000 | text -> text | fp4, fp8 | BaseTen, DeepInfra, Venice | yes (4 endpoints) | reasoning on; effort=high/medium |
| `poolside/laguna-xs-2.1:free` | Poolside | P1 coding | 262,144 | text -> text | fp8 | Poolside | yes (1) | reasoning on |
| `inclusionai/ling-3.0-flash-sante:free` | InclusionAI | P-specialized (health) | 262,144 | text -> text | not published | **none** | **NO** | reasoning on; dead entry |
| `inclusionai/ling-3.0-flash-fin:free` | InclusionAI | P-specialized (finance) | 262,144 | text -> text | fp4 | DeepInfra | yes (1) | reasoning on |
| `cohere/north-mini-code:free` | Cohere | P1 coding | 256,000 | text -> text | not published | **none** | **NO** | **moderated**; dead entry |
| `dots-studio/dots-3-note-preview:free` | Dots Studio | P1 general | 512,000 | text+image -> text | not published | **none** | **NO** | image in; dead entry |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | NVIDIA | P1, conditional on A3 fix | 256,000 | text+audio+image+video -> text | not published | **none** | **NO** | reasoning on; image in; dead entry |
| `nvidia/nemotron-3.5-content-safety:free` | NVIDIA | off-path safety | 128,000 | text+image -> text | bf16 | DeepInfra | yes (1) | reasoning on; image in; multimodal |

**Correction, 2026-09-26. An earlier version of this section was wrong and has been rewritten.**
It claimed all eight had moved to a single *first-party* upstream — NVIDIA, Poolside, Novita,
Cohere and Atlas Cloud. Re-fetching `GET /api/v1/models/{id}/endpoints` for all eight shows that
is false on two counts:

- **Only Poolside is first-party.** Nemotron Ultra is served by BaseTen, DeepInfra and Venice;
  Ling Fin and Content Safety by DeepInfra. NVIDIA serves none of them. Novita, Cohere and
  Atlas Cloud appear as upstream for none of the eight.
- **Four of the eight have no endpoints at all** and are unroutable dead entries: Ling Sante,
  North Mini Code, Dots 3 Note Preview, and Nemotron Nano Omni. Each was retried three times to
  rule out a transient read, with a working control model alongside.

A model can be listed in the catalog at `prompt $0 / completion $0` and still have zero
endpoints. That is a real state, and it is the single most important thing this audit has found
about the free roster: **listing and availability are not the same fact.** Every intake check
must assert on the endpoints API, never on the catalog listing.

### Routability of the entire live `:free` roster

17 models are currently listed as `:free`. 12 are routable, 5 are not. The five dead entries
are exactly `cohere/north-mini-code`, `dots-studio/dots-3-note-preview`,
`inclusionai/ling-3.0-flash-sante`, `liquid/lfm-2.5-2.6b`, and
`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`.

Routable, with upstream redundancy:

| Model | Upstreams | Note |
|---|---|---|
| `qwen/qwen3.8-27b:free` | 16 | most redundant route available |
| `google/gemma-4-26b-a4b-it:free` | 14 | |
| `google/gemma-4-31b-it:free` | 12 | |
| `nvidia/nemotron-3.5-lightning:free` | 5 | |
| `nvidia/nemotron-3-super-120b-a12b:free` | 2 | |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 3 | target |
| `thinkingmachines/inkling:free` | 2 | |
| `thinkingmachines/inkling-small:free` | 1 | |
| `poolside/laguna-xs-2.1:free` | 1 | target |
| `poolside/laguna-s-2.1:free` | 1 | new, not previously tracked |
| `inclusionai/ling-3.0-flash-fin:free` | 1 | target |
| `nvidia/nemotron-3.5-content-safety:free` | 1 | target |

Three caveats visible in the target table:

- `cohere/north-mini-code:free` is **moderated**, an A5 disclosure requirement rather than a
  defect — and it is also unroutable, so the point is currently moot.
- `nvidia/nemotron-3-ultra-550b-a55b:free` is served in **fp4** as well as fp8. Four-bit weights
  are a quality claim that B6 evidence must speak to.
- **This field is live and moves.** Re-fetch before relying on any reading of it, and never
  infer availability from the catalog listing alone.

`knowledge_cutoff`, `expiration_date`, and `per_request_limits` are null for all eight, and
`hugging_face_id` is null for three. B2.1 forbids blank fields, so these are modelled as
explicit nulls with a documented meaning, never as empty strings.

## 12. Model owners and upstream providers

OpenRouter resells; it does not own these weights. Owner sites and upstream inference sites,
all resolved live on 2026-09-25:

| Role | Entity | Official site |
|---|---|---|
| Owner | NVIDIA | [nvidia.com](https://www.nvidia.com) |
| Owner | Poolside | [poolside.ai](https://poolside.ai) |
| Owner | InclusionAI | [inclusionai.org](https://inclusionai.org) |
| Owner | Cohere | [cohere.com](https://cohere.com) |
| Owner | Dots Studio | [dots.studio](https://dots.studio) |
| Upstream | BaseTen | [baseten.co](https://www.baseten.co) |
| Upstream | DeepInfra | [deepinfra.com](https://deepinfra.com) |
| Upstream | Poolside | [poolside.ai](https://poolside.ai) |
| Upstream | Venice | [venice.ai](https://venice.ai) |

Two owner domains are easy to get wrong and were checked on purpose: `inclusionai.com` does not
resolve, and `dots.ai` is an unrelated Chinese app. Poolside is the only owner site the catalog
itself links, from the Laguna XS description; the rest were confirmed out-of-band, with NVIDIA
and Cohere additionally corroborated by the domains they publish as `privacy_policy_url` and
`terms_of_service_url` in the OpenRouter provider catalog.

Poolside and Venice publish no status page, so there is no outage signal to poll for the two
upstreams serving Laguna XS.

## 13. AionLabs — evaluated directly, not through OpenRouter

Evaluated on its own first-party API rather than as an OpenRouter upstream, because a
credential was supplied for direct testing. **Status: not admitted. A8.3 is unresolved and
A5 fails outright.**

| | |
|---|---|
| API base | `https://api.aionlabs.ai/v1` (OpenAI-compatible) |
| Auth | `Authorization: Bearer <key>` or `Api-Key <key>` |
| Discovery | `GET /v1/models` is public, no auth |
| Docs | [api.aionlabs.ai/docs](https://api.aionlabs.ai/docs) |
| Free tier | **none** — $0.70–$3.00 per 1M input |
| Focus | roleplay, creative writing, mature themes |
| Models | 6, all `text -> text`, none moderated, 32K–256K context |

Live results with the supplied key (3 calls, spaced to respect the stated limit):

| Test | Result |
|---|---|
| plain chat | HTTP 200, but **`content` came back empty** |
| streaming | HTTP 200, valid SSE, terminates with `[DONE]` |
| tool call | HTTP 200, `finish_reason: tool_calls`, exact `{"city": "Paris"}` |
| rate-limit headers | **none exposed** |

**The default response shape is a trap.** These are reasoning models and `reasoning_split`
is on by default: the visible answer is returned in a separate `reasoning` field and
`message.content` is an empty string. A client that reads `content` — which is most
OpenAI-compatible tooling — gets nothing back, with no error. Two workarounds were tested:

- `reasoning_effort: "none"` → `content: "PONG"`, `finish_reason: stop`. **Use this.**
- `reasoning_split: false` → **worse.** It inlines raw `<think>…` into `content` and
  returns `finish_reason: length`. Do not use.

Any integration must pin `reasoning_effort: "none"` explicitly, or normalise the `reasoning`
field, or it will silently drop every answer.

### A5 — fails

There is no free tier. Cheapest model is $0.70 / 1M input. Nothing here satisfies the
free-tier requirement, and it cannot serve as a free overflow source. OpenRouter lists
`aion-labs` with 6 models and 0 free, so it is `⚠️ paid-only` there too.

### A8.3 — unresolved, and this is the decisive issue

Terms §5.1 grants a licence "to access and use the Platform, including in commercial contexts
such as building and operating products and services using the Aion Labs API."

Terms §5.2 then withholds the right to:

> Sublicense, modify, adapt, translate, reverse engineer, decompile, disassemble, or create
> derivative works based on the Platform

> Resell or commercially exploit the Platform itself or resell raw API access as a standalone
> product without our prior written consent

A routing gateway that forwards requests and adds selection and metadata arguably falls under
§5.1's "building and operating products and services using the Aion Labs API". But if it is
characterised as reselling raw API access, §5.2 captures it and requires prior written consent.
The text does not resolve which side a multi-tenant aggregator lands on, and the licence
"terminates automatically if you violate any of these restrictions."

**This needs written consent or a legal opinion before any code is written.** It is not a
risk to note and proceed past.

### Stated limits — unverified

The supplied figures are **15 RPM and 20K tokens/day**. The published rate-limit page is
client-side rendered and its headings read "Requests Per Minute" and "**Tokens Per Minute**",
not tokens per day, so the daily figure could not be confirmed from the provider's own docs.
No rate-limit headers are returned on responses, so the limit is not observable at runtime
either. A 3-call test is far too small to infer a 15 RPM ceiling. Treat both numbers as
operator-supplied and unverified, and confirm them with AionLabs before depending on them.

### Data-quality note

The OpenRouter catalog lists `aion-labs` headquarters as `IL` (Israel). That was not
independently confirmed and looks questionable for this company. Do not rely on the catalog's
HQ field for A3 data-residency work without verifying it at source.

## 14. Cohere — evaluated directly

Tested against Cohere's own first-party API with a supplied credential, not through
OpenRouter. **Status: not admitted. A8.3 fails on the self-serve terms, and A5 fails because
there is no free tier on the direct API.**

| | |
|---|---|
| v1 base | `https://api.cohere.com/v1` |
| v2 base | `https://api.cohere.com/v2` |
| Auth | `Authorization: Bearer <key>` |
| Terms | [cohere.com/terms-of-use](https://cohere.com/terms-of-use) |
| Status page | [status.cohere.ai](https://status.cohere.ai) |
| Catalog on this key | 20 models, 11 chat-capable, 0 finetuned (stock key) |

Chat-capable: `command-a-03-2025`, `command-a-plus-05-2026` (436K ctx),
`command-a-reasoning-08-2025`, `command-a-vision-07-2025`, `command-a-translate-08-2025`,
`command-r-08-2024`, `command-r-plus-08-2024`, `command-r7b-12-2024`,
`command-r7b-arabic-02-2025`, `c4ai-aya-expanse-32b`, `c4ai-aya-vision-32b`.
Also `embed-*` (1024-dim verified), `rerank-english-v3.0` (verified, correct ordering),
`embed_image`, and `transcriptions`.

### `north-mini-code` is not reachable here

The free model OpenRouter serves through the `cohere` upstream,
`cohere/north-mini-code:free`, **does not appear in this key's model catalog at all**. It is
exposed via OpenRouter only. So the free Cohere route cannot be reproduced against Cohere
directly, and the free tier is a property of OpenRouter's `:free` variant, not of Cohere.

### Two incompatible wire formats — use v2

v1 and v2 differ in ways that silently break naive clients:

| | v1 | v2 |
|---|---|---|
| streaming | **JSONL**, not SSE — `event_type: stream-start / text-generation / stream-end` | **SSE** `data:` frames, `delta.message.content.text` |
| tool schema | native: `name` at top level, `parameter_definitions` | **accepts OpenAI shape** |
| tool args | `parameters` is a JSON **object** | `function.arguments` is a JSON **string** |

An OpenAI-shaped tool definition sent to v1 returns **HTTP 400**
(`all elements in tools must have a name`). v1 is not OpenAI-compatible despite looking it.
v2 handled the identical OpenAI payload and returned a correct call. **Target v2 only.**

Verified on the supplied key: chat 200 (`text: "PONG"`, `finish_reason: COMPLETE`); tool call
returned exact `{"city": "Paris"}`; v2 streaming reassembled correctly and terminated with
`message-end` / `finish_reason: COMPLETE`; embed returned 1024 dims; rerank ordered
"Paris is the capital of France" at 0.999 above the Berlin distractor at 0.0.

**Token accounting caveat:** Cohere injects a preamble. A five-word request billed
`input_tokens: 501`, of which 448 were `cached_tokens`. Budget for ~500 input tokens of
overhead per call before comparing any per-request cost.

### A8.3 — fails on the self-serve terms

The restricted-use clause is a represent-and-warrant, not a mere prohibition:

> you represent and warrant to and covenant with Cohere that you will not (and will not
> attempt to) directly or indirectly: … otherwise use, copy, distribute, or make available the
> Cohere Solution to permit **timesharing, service bureau use or commercially exploit the
> Cohere Solution**

"Services bureau use" is the standard term for serving many downstream clients from one
licence, which is exactly what a multi-tenant routing gateway does. The clause is covenanted
and warranted, so breach is a contractual default rather than a grey area. Notably the terms
contain **no** "resell" wording at all — the substance is carried entirely by
"timesharing / service bureau use". The terms also state the solution is "designed for business
use" and bar personal, family or household use.

Cohere is a legitimate enterprise vendor with a formal partner route, so this is not "never" —
it is "not under the self-serve terms". Any use here needs an enterprise or partner agreement
that expressly permits multi-tenant embedding.

### A5 — fails

No free tier on the direct API. `north-mini-code:free` is free **through OpenRouter** and is
not in Cohere's own catalog. Trial keys exist but are rate-limited and are not a durable tier.

### Unverified

No rate-limit headers were returned on any response, and a handful of calls cannot establish
a ceiling. Trial versus production limits for this key are unconfirmed; confirm with Cohere
before depending on throughput. The published rate-limit docs page loads but was not scraped.

---

## 15. Friendli direct evaluation

**Status: Not admitted — ToS is the best of the three reviewed, still legally ambiguous**
**Read 2026-09-26. No credential supplied, so this is documented research only; nothing was live-tested.**

### Access

- Self-serve signup at `https://auth.friendli.ai/sign-up` (HTTP 200). No approval gate,
  no corporate-domain requirement, no sales call. This is the fastest path to a testable
  credential of any provider reviewed so far.
- Base URL: `https://api.friendli.ai/serverless/v1` (OpenAI-compatible). `https://api.friendli.ai/v1`
  is 404 — the `/serverless/v1` prefix is required.
- An **Anthropic-compatible Messages API** exists in beta, plus an OpenAI-compatible
  Chat Completions API. Python SDK: `friendli`.
- SOC 2 Type II and HIPAA compliant.

### Model catalog — public, no key required

`GET https://api.friendli.ai/serverless/v1/models` returns the full catalog and per-token
prices **without authentication** (an invalid bearer token still returns 200).

| Direct model | OR equivalent | in $/M | out $/M | cache in $/M |
|---|---|---|---|---|
| `zai-org/GLM-5.3` | `z-ai/glm-5.3` | 1.26 | 3.96 | 0.234 |
| `zai-org/GLM-5.3-Flash` | `z-ai/glm-5.3-flash` | 0.15 | 0.50 | 0.03 |
| `zai-org/GLM-5.2` | `z-ai/glm-5.2` | 1.40 | 4.40 | 0.26 |
| `zai-org/GLM-5.1` | `z-ai/glm-5.1` | 1.40 | 4.40 | 0.26 |
| `google/gemma-4-31B-it` | `google/gemma-4-31b-it` | 0.14 | 0.40 | — |
| `deepseek-ai/DeepSeek-V3.2` | `deepseek/deepseek-v3.2` | 0.50 | 1.50 | 0.25 |
| `MiniMaxAI/MiniMax-M2.5` | `minimax/minimax-m2.5` | 0.30 | 1.20 | 0.06 |

**The direct catalog and the OpenRouter footprint are an exact 7-for-7 match.** This is the
first provider reviewed where OpenRouter neither hides nor adds a model. For those seven,
OpenRouter is a pure pass-through and buys nothing that direct access does not already give
except pooled routing and billing.

- **No free tier.** Every entry is priced; the floor is $0.14/M input. The catalog's
  `OR :free` count of 0 is consistent with the direct price list, so no inference is needed
  from OpenRouter data here.
- The advertised **$5 free credits attach to the Dedicated Endpoints Basic plan**, not to
  Model APIs. Treat as not applying to the model API surface. A separate "$10K credit
  program" requires an application.
- Tool-assisted chat completions are labelled **beta**.

### A8.3 — the significant finding

Friendli is the only provider reviewed so far that **defines our exact business model as a
sanctioned category** rather than prohibiting it:

- `Model Gateway` is a defined term — *"any third-party platform, marketplace, router, or
  aggregation service through which customers can access Friendli Services."*
- **Deemed assent:** agreeing to a third party's terms that reference these terms is
  *"deemed your assent to enter into these Terms directly with FriendliAI Corp."* So a
  gateway does not have to sub-license; end users land under Friendli's ToS automatically.
- Customer Data is defined to include data *"submitted to FriendliAI through a Model Gateway
  or similar service."*
- Friendli disclaims liability for Model Gateways, and the **SLA does not apply** to
  disruption arising from one.

**However, §8 Prohibitions still constrain the implementation.** A Customer may not, directly
or indirectly, allow any third party to:

- **(d)** have direct access to or use of a Friendli Service — except Authorized Users
  invited into a Team under §5;
- **(e)** access any Friendli Service *"on a 'stand-alone basis'"*, where the test is that
  *"Customer's products and services must add substantial functionality and value beyond the
  functionality and value of a Friendli Service"*;
- **(f)** use the service to provide *"service bureau, time sharing, rental, application
  services provider, hosting, or other computer services to third parties"*;
- **(m)(ii)** develop, operate, or commercialize any product that could *"directly or
  indirectly compete with any Friendli Service."*

**Reading.** §8(e) is the useful one: it states a test we can actually pass, and a router
adding routing, failover, metadata, normalisation and moderation is well outside "substantial
functionality beyond" raw inference. But §8(f) reads prohibitively on its face for any
multi-tenant reseller, and §8(m)(ii)'s non-compete is broad enough to arguably reach an
aggregation product built on their endpoints. The permission in the definitions and the
prohibition in §8 are in genuine tension, and the document does not resolve the conflict.

This is a **better starting position than AionLabs or Cohere** — there is a defined pathway and
a deemed-assent mechanism rather than a flat ban — but it is not self-serve-clean and should
not be admitted on my reading alone. Friendli maintains a **Partners** program
(`https://friendli.ai/partner`); the actionable step is written confirmation from them that an
aggregating gateway on their Model APIs is permitted, and on what terms. That is a commercial
question, not a legal one, and it is answerable.

### What I did not test

No credential was available, so none of the runtime evidence exists: no chat/tool/stream
probes, no `/models` response shape under a real key, no rate-limit headers, no latency
measurement. The public catalog above is the only first-party data obtained. A1.2, A2, A4, A5
and A8 all remain unevaluated on live behavior.

### Correction to catalog metadata

OpenRouter lists Friendli's headquarters as **US**, which is half right: FriendliAI Corp is a
US entity (Redwood City, CA on one page, San Francisco, CA on another) with its engineering
**hub in Seoul, Korea**. Data residency is not declared, so treat region as unresolved rather
than US.

---

## 16. Groq direct evaluation

**Status: Not admitted — best A8.3 path found so far, because the ban has a written-approval carve-out**
**Read 2026-09-26. Evaluated live with a real credential. Rotate that credential after reading.**

### Correction to the tracker

The catalog's ToS link for Groq points at `https://groq.com/terms-of-use/`, which is the
**website** terms — a "personal, non-commercial use only" licence covering content on the
websites. It is the wrong document. It explicitly defers: *"the Groq Services Agreement
governs."* The governing API contract is
**`https://console.groq.com/docs/legal/services-agreement`**, alongside an AUP and a DPA.
Anyone auditing this provider by following the catalog link would audit the wrong paper.

### Access and plan

- Base `https://api.groq.com/openai/v1`, OpenAI-compatible. Responses API also available.
- `GET /models` **requires auth** (401 on an invalid key), unlike Friendli. 11 models returned.
- **The supplied key is on a free plan.** Evidenced by `x-ratelimit-limit-tokens: 8000`, an
  exact match for Groq's published free-tier TPM, and by the error surface below. No card on
  file. 8 of 11 models are reachable on it (see table).
- Chat succeeded without payment, so **there is a genuine usable free tier**, subject to
  §6.3(d)(iii) below.

| Model | 131k/ctx | Reachable on free key |
|---|---|---|
| `qwen/qwen3.8-27b` | 131072 | yes |
| `openai/gpt-oss-120b` | 131072 | yes |
| `openai/gpt-oss-20b` | 131072 | yes |
| `openai/gpt-oss-safeguard-20b` | 131072 | yes |
| `allam-2-7b` | 4096 | yes |
| `meta-llama/llama-prompt-guard-2-22m` | 512 | yes |
| `meta-llama/llama-prompt-guard-2-86m` | 512 | yes |
| `canopylabs/orpheus-arabic-saudi` | 4000 | **no** — "requires terms acceptance" |
| `canopylabs/orpheus-v1-english` | 4000 | **no** — "requires terms acceptance" |
| `whisper-large-v3` | 448 | no — chat endpoint only, needs audio API |
| `whisper-large-v3-turbo` | 448 | no — chat endpoint only, needs audio API |

- **Free plan is 6 TPM lower than the published free tier.** Measured
  `x-ratelimit-limit-tokens: 8000` with
  `x-ratelimit-reset-tokens: 345ms` (first call) and `285ms` (second, milliseconds later). Two
  independent requests placed milliseconds apart, each drawing a fresh 8000-token allowance.
  Documented free-tier TPM is 6000. Either the allowance is per-request rather than per-window,
  or this account type is restricted below the published free tier. **Unresolved — measure over
  a sustained burst and flag as a capacity risk.**

### Live behavior — all passing

- **Chat**: `qwen3.8-27b` returned `PONG`, `finish_reason: stop`, model echoed exactly.
- **Streaming**: clean SSE, 16 `data:` frames, proper `[DONE]`, reassembles exactly
  (`'1, 2, 3, 4, 5.'`). No inter-frame corruption.
- **Native tools**: returns `finish_reason: tool_calls` with a well-formed
  `{"city":"Seoul"}` argument object. No prompt-embedding needed.
- **Alignment**: refused weapon synthesis in its own words, answered a benign poem. This is
  **model-level** refusal, not API-level moderation. Groq also ships
  `llama-prompt-guard-*` and `gpt-oss-safeguard-20b` as separate callable models, and the
  console has a Content Moderation feature. No provider-level filter was observed intercepting
  requests or rewriting output, but the free plan may apply one that simply did not trigger.
- **Telemetry**: `queue_time`, `prompt_time`, `completion_time`, `total_time` returned per
  request — better observability than any provider tested so far, and worth surfacing in
  OmniRouter metadata.
- **Region**: `x-groq-region` varied between `dls` and `fra` across two calls on the same
  account. Requests are **not pinned to a declared region**; data residency is unresolved.

### A8.3 — the material finding

§6.3(c): *"Customer will not … **(c) sell, resell, sublicense, transfer, or distribute any of
the Cloud Services except as expressly approved by Groq**."*

This is the first provider in the review where the resale ban is **not absolute**. The
carve-out is explicit and it is the ordinary commercial route: a signed approval from Groq.
Compare:

| Provider | Resale language | Path to aggregation |
|---|---|---|
| Cohere | "timesharing, service bureau use" prohibited | none self-serve |
| AionLabs | raw API resale/derivative works need prior written consent | consent, ambiguous |
| **Groq** | **"except as expressly approved by Groq"** | **written approval — defined, purchasable** |
| Friendli | gateway blessed but §8(f) bars service-bureau use | Partners channel |

Two further clauses shape the answer:

- **§6.3(e) is a non-compete**: no using the services to develop or improve products *"that
  are similar or compete with the Cloud Services."* A router is a different product category
  from LPU inference, so the narrower reading favours us; the broader reading does not.
- §6.3(d)(iii) bars use *"in a manner intended to avoid incurring Fees."* Serving end users
  on a free plan while charging them is the exact pattern this targets. **Paid-tier
  aggregation needs a commercial agreement; free-tier aggregation is the exposed flank.**

- **"End Users" are contemplated.** The definitions make Authorized Users include End Users,
  which include *"other authorized third parties permitted by Customer."* A multi-tenant model
  is anticipated by the document. What is missing is consent, not a contractual concept.

Verdict: **legally ambiguous, commercially addressable.** Ask Groq for express written approval
under §6.3(c), and get the non-compete in §6.3(e) carved out in the same document. Until that
exists, no admission.

### The qwen3.8-27b finding — worth acting on separately

Our hold list carries `qwen/qwen3.8-27b:free` because its free availability was unverified.
Groq serves `qwen/qwen3.8-27b` **directly, on a free plan, at 131,072 context, today**. Two of
our three held models are served by providers we have now evaluated (this and Poolside). For
that one model the OpenRouter `:free` route is redundant — the direct route is free, 131k
context, and a genuinely frontier-tier path to the model.

It is still **not cleared for release**: the §6.3(c) approval does not exist, and Groq's free
plan TPM may be 6,000 rather than the 8,000 the header reports. The hold was correct when made;
it should be re-examined on the strength of this evidence rather than carried by default.

### Not tested

Free plan on the 2 terms-gated Orpheus models (needs terms acceptance in console); the
Anthropic-compatible surface; image input; structured outputs; the Responses API; sustained
burst behaviour to settle the TPM question; moderation behaviour on Llama models under the free
plan.
