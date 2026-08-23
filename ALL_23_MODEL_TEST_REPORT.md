# OmniRoute: Complete 23-Model Live Test Report

**Test target:** A private operator deployment; the live URL is intentionally not published in this repository.

**Test date:** 2026-08-21 UTC

Each exposed model received one bounded OpenAI-compatible `POST /api/v1/chat/completions` request with `stream: false`, a short prompt, and `max_tokens: 8`. Three initial transport timeouts were retried sequentially with a 90-second timeout.

## Summary

| Result | Count | Meaning |
|---|---:|---|
| HTTP 200 provider response | 6 | The gateway reached the provider and returned a completion-shaped response. Some were reasoning-only or ended because the deliberately small token limit was reached. |
| HTTP 401 authentication/promotion failure | 11 | The upstream rejected anonymous access or the model’s free promotion had ended. |
| HTTP 402 credit/quota failure | 2 | The anonymous G4F pool reported that its free “cake credits” were exhausted. |
| HTTP 503 provider unavailable | 4 | The gateway had no currently usable upstream route for the requested Kilo model. |
| **Total tested** | **23** | Every exposed model ID was tested. |

The verified HTTP-200 models were **6 of 23**. The verified keyless models that returned a usable HTTP-200 response were all in the OpenCode Zen family. The exact natural-language output varied because the test used a deliberately small `max_tokens` limit; HTTP 200 confirms route/provider execution, not that every model completed the prompt semantically before the cap.

## Complete results

### G4F Pollinations — 0 of 2 successful

| Model ID | Result | Detail |
|---|---:|---|
| `g4f-pollinations/openai` | **402** | Retry confirmed: anonymous G4F credits exhausted; provider suggested proof-of-work credits or account signup. |
| `g4f-pollinations/openai-fast` | **402** | Anonymous G4F credits exhausted; provider returned `insufficient_credits`. |

### Kilo Gateway — 0 of 4 successful

| Model ID | Result | Detail |
|---|---:|---|
| `kilo-auto/free` | **503** | `No configured provider can serve model kilo-auto/free`. |
| `nvidia/nemotron-3-super-120b-a12b:free` | **503** | `No configured provider can serve model ...`. |
| `minimax/minimax-m2.5:free` | **503** | `No configured provider can serve model ...`. |
| `arcee-ai/trinity-large-preview:free` | **503** | `No configured provider can serve model ...`. |

### Pollinations — 0 of 10 successful

| Model ID | Result | Detail |
|---|---:|---|
| `pollinations/openai` | **401** | `A valid API key is required`. |
| `pollinations/openai-fast` | **401** | `A valid API key is required`. |
| `pollinations/openai-large` | **401** | `A valid API key is required`. |
| `pollinations/qwen-coder` | **401** | Initial request timed out; retry confirmed `A valid API key is required`. |
| `pollinations/mistral` | **401** | `A valid API key is required`. |
| `pollinations/deepseek` | **401** | `A valid API key is required`. |
| `pollinations/grok` | **401** | `A valid API key is required`. |
| `pollinations/gemini-flash-lite-3.1` | **401** | `A valid API key is required`. |
| `pollinations/perplexity-fast` | **401** | `A valid API key is required`. |
| `pollinations/perplexity-reasoning` | **401** | Initial request timed out; retry confirmed `A valid API key is required`. |

### OpenCode Zen — 6 of 7 returned HTTP 200

| Model ID | Result | Detail |
|---|---:|---|
| `opencode-zen/big-pickle` | **200** | Completion response returned. The small token cap ended the response while it was reasoning. |
| `opencode-zen/deepseek-v4-flash-free` | **401** | Upstream reported that the free promotion had ended and directed users to OpenCode Go. |
| `opencode-zen/mimo-v2.5-free` | **200** | Completion-shaped response returned with reasoning and null visible content under the small token cap. |
| `opencode-zen/hy3-free` | **200** | Completion response returned; the small token cap ended the response during reasoning. |
| `opencode-zen/nemotron-3-ultra-free` | **200** | Completion response returned with visible content/reasoning. |
| `opencode-zen/nemotron-3.5-lightning-free` | **200** | Completion response returned with visible content/reasoning. |
| `opencode-zen/laguna-s-2.1-free` | **200** | Completion returned `ok` with `finish_reason: stop`. |

## Conclusion

The current deployment exposes all 23 catalog entries, but **only 6 returned HTTP 200 during this test window**. The other 17 were not gateway-code failures of the same kind: 11 were rejected by upstream authentication or an ended promotion, 2 had exhausted anonymous G4F credits, and 4 had no currently usable Kilo route.

The strongest current zero-credential result is the OpenCode Zen family: six of its seven exposed IDs returned HTTP 200, with `opencode-zen/laguna-s-2.1-free` producing a complete `ok` response. `opencode-zen/deepseek-v4-flash-free` is no longer available under the reported free promotion.

The Pollinations models should not be advertised as zero-credential models until a server-side Pollinations key is configured or the upstream anonymous-access policy changes. The Kilo entries should not be advertised as working until a current route is configured and re-tested. The G4F entries currently depend on anonymous quota that was exhausted at test time.

## Reproduction

The test script is available at `scripts/test-all-models.py`. The raw machine-readable results are available at `all-model-test-results.json`.
