# Free Model Provider Collaboration Program

**Nexuss AI Router (NAR)** is inviting free-tier AI model providers to join a live, production routing network. This page is the front door: what the program is, what we ask for, what you get, and how to submit in one issue.

Before you submit, read the standard your submission is measured against: **[Provider & Model Admission Criteria](CRITERIA.md)**.

---

## Why we are building this

Most free model access is unusable in real software. It is undocumented, it is per-IP throttled behind a shared serverless egress address, it fails in ways that look like success, and nobody publishes a number you can plan against.

NAR is a self-hosted, OpenAI-compatible gateway. It routes live traffic, and it makes the provider's contract explicit:

- Your rate limits become a documented, machine-checked part of the integration instead of a surprise.
- Your models are catalogued with real capability metadata, not marketing copy.
- Your free tier is reachable by applications that hold exactly one gateway key and never see your credential.
- Health and latency are measured continuously, so quality problems surface as routing decisions rather than as user-facing errors.

We are looking for providers who want their free tier to be genuinely reachable, and who are willing to publish the numbers that make that possible.

## Who we are looking for

Any provider or lab with a free tier that is reachable by an automated client, and who can supply the following:

- A stable, versioned OpenAI-compatible API base URL.
- A server-side API key for server-to-server use.
- **A published numeric rate limit, scoped per key or per account.**
- A free tier that requires no payment method and no paid commitment.
- Honest capability information per model: context window, vision support, tool support.
- Terms that permit automated API use and gateway aggregation.

The rate-limit requirement is the one that decides most applications, and it is worth being direct about why. A per-IP free tier on a serverless deployment is not a per-client limit. Every request leaves from the platform's shared egress range, so a per-IP cap becomes a global cap for the entire deployment, and those addresses are not stable or attributable. If your free tier is per-IP only, you can still join — you will be admitted with the effective ceiling documented, and your models will not lead the pool.

## What we offer

| | |
|---|---|
| **Reach** | Your models are catalogued and addressable by any NAR deployment, with one key and no client-side changes. |
| **Visibility** | Per-model success rate, latency, and failure-class telemetry, aggregated and shareable. |
| **Credit** | Where a free tier is capacity-constrained, we can discuss reserved capacity, prepaid credits, or sponsorship for load that would otherwise be rejected. |
| **Integration** | We maintain the provider adapter, the metadata rows, and the health monitoring. Submissions do not require you to write or maintain any client code. |
| **Attribution** | Optional display of provider name and documentation link in the catalog. |

## How to submit

**Open one issue** using the provider submission template. A complete submission is one comment; there is no application form and no waiting list.

1. **Open an issue** titled `Provider submission: <provider name>`.
2. **Complete the template.** It asks for the items in Appendix B of the criteria — operator and contact, base URL and auth method, published rate limits with scope and reset cadence, terms-of-service URL, model list with context windows, declared modality and tool support, and confirmation that the free tier needs no payment method.
3. **Attach probe evidence.** Scripts plus results. The bar is documented in section 3 of the criteria: at least 20 requests per model across at least 3 observation windows, reproducible and timestamped. A submission without evidence is still accepted — it enters the program as **Experimental**, addressable by explicit model ID, and is promoted once the evidence is in.
4. **We evaluate against the criteria** and reply with the outcome and the specific criteria that decided it: **Core**, **Candidate**, **Experimental**, or **Declined**, with a reason.
5. **Integration** happens in a pull request that adds the registry entry, the server-side key mapping, and one metadata row per model together. There is no partial state in which a provider is routable but undocumented.

### What happens after you are admitted

Your provider is monitored continuously for success rate, latency, and failure codes. A clean record moves you up tiers; the criteria describe the review cadence and what triggers a demotion. If something changes on your side — limits, terms, model IDs — tell us and we will update the integration rather than discover it from a failure.

### What we ask in return

- Publish the numbers. A rate limit that is not documented cannot be verified, and an unverifiable limit cannot be planned around.
- Keep your API contract stable, or announce changes with a migration path.
- Tell us when something breaks. Early signal from a provider is worth more to us than a postmortem.

## Scope

This program covers **free-tier text, embedding, image, audio, video, and safety models** reachable over an OpenAI-compatible API. It does not cover paid-only access, bespoke fine-tuned endpoints, or providers whose terms prohibit automated API use.

## Contributing code

Improvements to the standard itself are welcome and reviewed like any other change. The criteria document is the contract we hold ourselves to, so a change to it needs a rationale and a migration note for affected rows.

- Improve or extend [CRITERIA.md](CRITERIA.md) — open a pull request
- Submit a provider — open an issue with the provider submission template
- Report a problem with an admitted provider — open an issue

## Documentation

- [Provider & Model Admission Criteria](CRITERIA.md) — the standard every provider and model is measured against
- [README](README.md) — what NAR is and how to run it
- [Low-Latency Architecture](docs/LOW_LATENCY_ARCHITECTURE.md) — request lifecycle and routing design
