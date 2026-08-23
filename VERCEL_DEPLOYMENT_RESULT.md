# OmniRoute Vercel AI-Only Deployment Result

## Deployment

The verified Vercel preview deployment is:

`https://omniroute-parad-preview-iycy6jy0h-tadi0781-5784s-projects.vercel.app`

The deployment is a Next.js serverless AI-only profile using request-scoped Parad persistence. The final runtime fix uses sql.js’s pure-JavaScript asm build only in the Vercel AI-only profile, avoiding the missing `sql-wasm.wasm` asset. Docker and the normal SQLite/SQL.js path remain unchanged.

The single OmniRoute gateway key is:

`YOUR_OMNIROUTE_GATEWAY_KEY`

Keep this key server-side or in a secret manager. Provider credentials, where applicable, remain server-side and are never returned to clients.

## Client configuration

OpenAI-compatible clients should use:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://omniroute-parad-preview-iycy6jy0h-tadi0781-5784s-projects.vercel.app/api/v1",
  apiKey: "YOUR_OMNIROUTE_GATEWAY_KEY",
});

const response = await client.chat.completions.create({
  model: "opencode-zen/big-pickle",
  messages: [{ role: "user", content: "Hello" }],
});
```

A curl example is:

```bash
curl -X POST \
  'https://omniroute-parad-preview-iycy6jy0h-tadi0781-5784s-projects.vercel.app/api/v1/chat/completions' \
  -H 'Authorization: Bearer YOUR_OMNIROUTE_GATEWAY_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"model":"opencode-zen/big-pickle","messages":[{"role":"user","content":"Hello"}]}'
```

## Verification

The deployed model catalog returned HTTP 200 and 23 models. The live route matrix passed 21/21 checks: model catalog, Parad-backed files and jobs listing, all AI route dispatches, and a real chat completion. The working keyless provider test was:

- `opencode-zen/big-pickle`: HTTP 200, non-streaming completion succeeded.
- `opencode-zen/big-pickle` with `stream: true`: HTTP 200, `text/event-stream` SSE passthrough succeeded.
- Missing gateway key: HTTP 401 with the expected JSON error.

The catalog currently includes these built-in provider families and representative models:

| Provider family | Representative model IDs |
|---|---|
| OpenCode Zen | `opencode-zen/big-pickle`, `opencode-zen/deepseek-v4-flash-free`, `opencode-zen/mimo-v2.5-free` |
| Pollinations | `pollinations/openai`, `pollinations/qwen-coder`, `pollinations/deepseek` |
| Kilo Gateway | `kilo-auto/free`, `nvidia/nemotron-3-super-120b-a12b:free` |
| G4F Pollinations | `g4f-pollinations/openai`, `g4f-pollinations/openai-fast` |

## Important provider-status caveat

The deployment exposes the built-in Pollinations and Kilo model entries, but their current upstream behavior is not equivalent to the original historical “no key” claim. The live Pollinations completion returned HTTP 401 with “A valid API key is required,” which agrees with the current official Pollinations documentation stating that generation requests require a bearer key.[1] The live Kilo request returned HTTP 503 from the upstream gateway. OpenCode Zen was independently verified as working without a provider key.

Therefore, this deployment is verified for zero-credential routing through OpenCode Zen, but it should not yet be represented as a verified 42-pool / 1.51B-token guarantee. The catalog and gateway architecture are ready for additional provider pools, but each upstream’s current anonymous-access policy must be revalidated before counting it toward that total.

## Code state

The migration branch is clean at commit `1bc09bd`, following the earlier migration commits through `011f385`. The new commit adds the Vercel AI-only asm.js fallback in `next.config.mjs`. Focused gateway tests pass 6/6 locally, and the live route matrix passes 21/21.

The reproducible live smoke script is included in `scripts/live-smoke.sh`.

## Production deployment

The preview project is already linked to `omniroute-parad-preview`. After reviewing the provider status and rotating the exposed preview key if this document has been shared beyond the intended operator, deploy the same profile to production with:

```bash
cd /home/ubuntu/OmniRoute-ai-only-deploy
vercel --prod
```

### References

[1]: https://gen.pollinations.ai/docs "Pollinations API documentation"
[2]: https://github.com/pollinations/pollinations/blob/main/APIDOCS.md "Pollinations APIDOCS.md"
