# Provider access audit — consolidated report

**Date:** 2026-09-26 · **Repo:** `Omnirouter-vercel` @ `main`, last pushed `8486308` · **Production:** `omniouter-vercel.vercel.app`
**Status:** No OpenRouter integration exists. Runtime is Kilo-only, 2 models. Nothing below is wired into the app.

---

## 1. Headline

Nothing is admitted. The audit has produced four provider evaluations, one significant
correction to earlier work, and a list of blockers that are mostly *not* about technology.

The most important finding is that **four of the eight evaluation targets are unroutable dead
entries** — listed in the OpenRouter catalog at `$0/$0` with no serving endpoint behind them.
An earlier draft of this audit asserted those same models had moved to first-party upstreams.
That assertion was wrong and has been corrected in `OPENROUTER.md` §11.

---

## 2. The correction that matters

`GET /api/v1/models/{id}/endpoints`, all eight targets, live:

| Target | Endpoints | Upstreams |
|---|---|---|
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 4 | BaseTen, DeepInfra, Venice |
| `poolside/laguna-xs-2.1:free` | 1 | Poolside |
| `inclusionai/ling-3.0-flash-fin:free` | 1 | DeepInfra |
| `nvidia/nemotron-3.5-content-safety:free` | 1 | DeepInfra |
| `inclusionai/ling-3.0-flash-sante:free` | **0** | — |
| `cohere/north-mini-code:free` | **0** | — |
| `dots-studio/dots-3-note-preview:free` | **0** | — |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | **0** | — |

Retried 3× each to exclude a transient read, with a working control model in the same batch.

**Consequences:**

- Only **4 of 8** targets are viable. The four that died are the specialized/interesting ones:
  health, moderated coding, multimodal note-taking, and the omni model.
- **Only Poolside is genuinely first-party.** NVIDIA, Novita, Cohere and Atlas Cloud serve none
  of the eight — they are model *owners* or catalog names, not the parties actually serving.
- A catalog listing at `$0` is not evidence of availability. Any intake check must assert on
  the endpoints API.
- 5 of all 17 live `:free` models are in this dead state.

### Candidates that should now be reconsidered

`qwen/qwen3.8-27b:free` has **16 upstreams** — the most redundant route on the board — and it
was on our hold list for unverified free availability. That reasoning is now obsolete.
`nvidia/nemotron-3.5-lightning:free` (5) and `nvidia/nemotron-3-super-120b-a12b:free` (2) are
also routable and were not in the target set.

---

## 3. Provider evaluations

| Provider | Row | Direct free? | A8.3 aggregation path | Admitted |
|---|---|---|---|---|
| AionLabs | 2 | no — $0.70–3.00/M | prior written consent, §5.2 ambiguous | no |
| Cohere | 14 | no | none — "timesharing, service bureau" barred | no |
| Friendli | 40 | no — $0.14–1.40/M | **Partners channel**, gateway blessed but §8(f) bars it | no |
| Groq | 44 | **yes** | **§6.3(c) "except as expressly approved by Groq"** | no |

**A8.3 ranking.** Groq is the only provider whose resale ban carries an explicit written-approval
carve-out — a defined, purchasable path rather than a prohibition. Friendli defines "Model
Gateway" as a sanctioned category and has deemed-assent, but §8(f) independently bars
service-bureau use, and §8(m)(ii) is a broad non-compete. Cohere and AionLabs have no
self-serve path at all.

**Only Groq offers a usable free tier.** Verified by live inference on a cardless key, plus the
`x-ratelimit-limit-tokens: 8000` header matching Groq's published free-tier figure.

**The ToS-link defect.** OpenRouter's provider catalog points Groq's terms at
`groq.com/terms-of-use` — the *website* terms, a "personal, non-commercial use only" licence
over page content, which themselves say "the Groq Services Agreement governs." The real API
contract is `console.groq.com/docs/legal/services-agreement`. An auditor following the catalog
link reads the wrong document and reaches the wrong conclusion. Corrected in the tracker. This
class of defect is likely present elsewhere in the 110-row table and has not been swept.

---

## 4. Blockers

**Hard, and outside our control:**

- A8.3 written permission — Groq §6.3(c), or Friendli Partners. Nothing ships without one.
- §6.3(d)(iii) bars use "in a manner intended to avoid incurring Fees," which is precisely
  aggregating a free tier while charging users. Paid-tier aggregation needs a commercial deal.
- §6.3(e) non-compete is broad enough to arguably reach an aggregation product.

**OpenRouter's own gates:**

- A8.3 gateway-aggregation permission — never verified. This is independent of the provider
  approvals above and just as blocking.
- Evidence bar unmet: 20 requests/model across 3 time windows, reproducibly. No campaign run.
- A1.2 streaming evidence incomplete.

**Unverified, flagged rather than resolved:**

- Groq free-plan TPM. Header says 8000; published free tier is 6000. Two calls milliseconds
  apart each drew a fresh 8000 allowance, so it may be per-request, or this account may sit
  below the published tier. Capacity risk if wrong.
- Groq residency. `x-groq-region` flipped `dls` → `fra` between calls on one account. Requests
  are not pinned.
- AionLabs limits (15 RPM / 20K TPD asserted, unconfirmed; docs say TPM; no headers emitted).
- AionLabs reasoning behaviour: default `reasoning_split` can yield empty `message.content`.
  Needs `reasoning_effort: "none"`.

**Engineering:**

- `openrouterCatalog.ts` is standalone — imported nowhere. Not wired to `modelMetadata.ts` or
  `gateway.ts`.
- It references `scripts/providers-sync.mjs` as its regeneration path. That script does not exist.
- No test suite, no `npm test`.

---

## 5. Data integrity note

The endpoint data is **live and demonstrably unstable** — it changed once during this audit and
reverted on re-fetch. Every upstream claim in this report is timestamped. The generated catalog
happened to be correct; the error was in the hand-written dossier prose. That is the pattern to
avoid: anything derived from a live field belongs in a regenerable file with a fetch date, not
in prose.

---

## 6. Outstanding work

1. Obtain written A8.3 permission from Groq, with §6.3(e) carved out.
2. Sweep the remaining 108 rows for wrong-document ToS links, as Groq had.
3. Re-baseline the target list against routability; promote `qwen3.8-27b` out of hold.
4. Run the 3-window evidence campaign on whatever survives step 3.
5. Add `scripts/providers-sync.mjs` or delete the claim in the catalog header.
6. Decide whether `PROVIDER.md` should be tracked — it is currently gitignored.

---

## 7. Security

Four credentials were pasted in conversation and are exposed: AionLabs, Cohere, Groq, and an
earlier OpenRouter key. All are compromised regardless of local file permissions. Stored at
`/tmp/opencode/.{aionkey,coherekey,groqkey}` mode `600`; the OpenRouter key was lost to a
`/tmp` wipe. None are in the repository. **All four need rotating.**
