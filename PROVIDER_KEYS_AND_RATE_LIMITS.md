# OmniRoute Provider Keys and Rate Limits

## Executive answer

You already have the only key required by client applications: the **OmniRoute gateway key** in `OMNIROUTE_AI_API_KEY`. Client projects should never receive provider keys.

For the currently exposed providers, the optional server-side credentials are:

| Provider family | Server-side key needed? | Environment variable recommended | Current reason |
|---|---|---|---|
| OpenCode Zen | Optional for the currently working free endpoints; recommended for account-backed or paid access | `OPENCODE_ZEN_API_KEY` | Keyless free models worked for most OpenCode models in the live test, but OpenCode officially describes Zen as an account/API-key provider and its free models are time-limited promotions.[1] |
| Pollinations | **Yes for current generation endpoints** | `POLLINATIONS_API_KEY` | All ten Pollinations models returned HTTP 401 without a key. Official docs require a bearer key; use a server-side `sk_...` secret for backend access.[2] |
| Kilo Gateway | Recommended, and likely required for reliable external API use | `KILO_API_KEY` | Kilo’s documentation says API-key authentication is needed when using the gateway outside Kilo Code. Its free tier is officially available to anonymous and authenticated users, but the deployed requests returned HTTP 503 because no usable route was available.[3] |
| G4F Pollinations | Recommended for stable access | `G4F_API_KEY` | The anonymous route returned HTTP 402 because its G4F “cake credits” were exhausted. G4F’s members area provides API keys and usage monitoring.[4] |
| Direct Kimi/Moonshot | Required if using Moonshot directly | `MOONSHOT_API_KEY` | Kimi is not currently a separate provider in the deployed 23-model catalog. It can be added through Moonshot directly, or accessed through Kilo/OpenCode where supported. |

The keys should be entered as **Vercel Preview/Production environment variables** or stored in Parad provider-connection records. They must never be placed in client-side configuration, model responses, logs, or the public repository.

## Provider rate limits

The provider limits below are the current documented limits where the provider publishes a numeric value. A provider’s limit is not automatically the same as the limit of the OmniRoute gateway, especially because several client projects share the same upstream credential and Vercel requests are stateless.

| Provider | Current documented or observed limit | Interpretation |
|---|---|---|
| Kilo free models | **200 requests/hour per IP address** for free models, including anonymous and authenticated traffic.[3] | This is approximately 3.33 requests/minute at the upstream IP scope. Paid traffic has no Kilo gateway-level limit according to the cited documentation, but account and upstream limits still apply. |
| Pollinations | No single numeric quota was visible in the current public API page. The official docs require a bearer key; account/key budgets and endpoint policies apply.[2] | Do not assume the old anonymous/no-key behavior. Our live tests returned HTTP 401 for all ten Pollinations models. |
| OpenCode Zen | No fixed public requests-per-minute number was documented on the Zen page. The page states that free models are available for a limited time and that workspace/member monthly usage limits can be configured.[1] | Treat free-model capacity as dynamic. The upstream may return 401/403/429 or retire a promotion, as happened to `deepseek-v4-flash-free`. |
| G4F | No stable numeric anonymous request quota was documented in the current pages. The live anonymous endpoint returned HTTP 402 with `insufficient_credits` and directed the caller to earn proof-of-work credits or create an account.[4] | The available anonymous quota is dynamic rather than a guaranteed requests-per-minute allowance. |

## Recommended OmniRoute gateway policy

Because Vercel functions do not share reliable process memory, the gateway should enforce its own limits with **Parad-backed counters** or a dedicated shared rate-limit store. An in-memory limiter would reset on cold starts and would not protect the shared upstream key across concurrent Vercel instances.

The following conservative starting policy is recommended until provider-specific headers and quotas are observed over a longer period:

| Scope | Recommended starting cap | Purpose |
|---|---:|---|
| Each OmniRoute gateway key, all endpoints | 60 requests/minute | Protects the deployment from accidental client loops. |
| Each gateway key, chat/completions | 30 requests/minute | Prevents one client from consuming the whole shared pool. |
| OpenCode free pool, global | 10 requests/minute and 2 concurrent requests | Conservative because OpenCode does not publish a fixed numeric free-model rate limit. |
| Pollinations shared key, global | 10 requests/minute and 2 concurrent requests | Avoids wasting paid/account budget while the exact quota remains account-specific. |
| Kilo free pool, global | 180 requests/hour | Leaves a small buffer below Kilo’s documented 200/hour/IP limit. This must be global across all gateway clients, not per client. |
| G4F anonymous pool, global | 2 requests/minute until authenticated | The upstream quota is dynamic and already returned HTTP 402; rate limiting cannot replenish exhausted credits. |
| Retry behavior | Honor upstream `Retry-After`; exponential backoff; no immediate retry on 401/402 | Prevents retry storms and avoids repeatedly sending invalid or exhausted requests. |

These are **OmniRoute safety caps**, not claims made by the providers. The gateway should record provider status, `Retry-After`, model, latency, and usage in Parad so the caps can be tuned from actual traffic.

## Credential setup examples

The following commands add provider credentials to the Vercel Preview environment. Replace the placeholders locally; do not paste secret values into source files or public chat.

```bash
cd /home/ubuntu/OmniRoute-ai-only-deploy
T='YOUR_VERCEL_TOKEN'

printf '%s' "$POLLINATIONS_API_KEY" | npx vercel env add POLLINATIONS_API_KEY preview --yes --token="$T"
printf '%s' "$KILO_API_KEY"        | npx vercel env add KILO_API_KEY        preview --yes --token="$T"
printf '%s' "$G4F_API_KEY"          | npx vercel env add G4F_API_KEY          preview --yes --token="$T"
printf '%s' "$OPENCODE_ZEN_API_KEY" | npx vercel env add OPENCODE_ZEN_API_KEY preview --yes --token="$T"
```

The current lean gateway code has a generic `OMNIROUTE_AI_PROVIDER_ID`, `OMNIROUTE_AI_PROVIDER_BASE_URL`, `OMNIROUTE_AI_PROVIDER_API_KEY`, and `OMNIROUTE_AI_PROVIDER_MODELS` path, plus built-in provider definitions. Provider-specific environment variables above should be wired into those built-in definitions before deployment; otherwise adding the variables alone will not make the built-in providers send them.

## Important implementation note

The existing gateway currently sends an empty bearer value for the dedicated chat-completions path instead of using provider-specific built-in secrets. Therefore, the correct implementation is not simply to add environment variables. It should resolve a provider’s server-side key and construct headers as follows: Pollinations and Kilo use `Authorization: Bearer <server-side-key>`; G4F uses the key format accepted by its `g4f.space` API; OpenCode Zen may use its bearer key when configured but should preserve the existing synthesized OpenCode identity headers.

## References

[1]: https://opencode.ai/docs/zen/ "OpenCode Zen documentation"
[2]: https://gen.pollinations.ai/docs "Pollinations API documentation"
[3]: https://kilo.ai/docs/getting-started/rate-limits-and-costs "Kilo rate limits and costs"
[4]: https://g4f.dev/members.html "G4F members area and API keys"
