# Current OmniRoute Model Inventory

This snapshot documents every model currently returned by the protected OmniRoute `/models` endpoint. It combines the live catalog with the completed direct benchmarks. Benchmark quality is a 0–4 deterministic instruction-following score for an exact three-line response; it is evidence of successful response handling, not a broad capability ranking.

## Inventory summary

| Provider | Exposed models | Benchmarked | Readable HTTP 200 benchmarks |
| --- | ---: | ---: | ---: |
| kilo-gateway | 2 | 2 | 2 |
| opencode-zen | 3 | 3 | 3 |
| openrouter | 17 | 17 | 5 |
| airforce | 50 | 5 | 4 |
| **Total** | **72** | **50** | **14** |

## Evidence-led quality-first Auto proposal

The proposed order uses only models with a readable HTTP 200 completion in the completed benchmarks. It prioritizes broader-capability model families first, retains independently reachable providers, and keeps Airforce behind the primary paths because its provider-wide rate limit is shared.

| Priority | Proposed model | Evidence |
| ---: | --- | --- |
| 1 | `airforce/kimi-k2.7-code` | Modern code/general route; benchmarked readable at 4/4. |
| 2 | `kilo-gateway/nvidia/nemotron-3-super-120b-a12b:free` | Large verified general model; benchmarked readable at 4/4. |
| 3 | `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | Independent verified Nemotron Super route; benchmarked readable at 4/4. |
| 4 | `openrouter/minimax/minimax-m3:free` | Verified modern route; benchmarked readable at 4/4. |
| 5 | `opencode-zen/mimo-v2.5-free` | Verified coding route; benchmarked readable at 4/4. |
| 6 | `opencode-zen/hy3-free` | Verified coding route; benchmarked readable at 4/4. |
| 7 | `opencode-zen/laguna-s-2.1-free` | Verified coding route; benchmarked readable at 4/4. |
| 8 | `airforce/gpt-oss-20b` | Reasoning-capable verified route; benchmarked readable at 4/4. |
| 9 | `airforce/mistral-code-agent-latest` | Fast verified coding fallback; benchmarked readable at 4/4. |
| 10 | `airforce/devstral-2512` | Verified coding fallback; benchmarked readable at 4/4. |
| 11 | `openrouter/cohere/north-mini-code:free` | Verified code-focused fallback; benchmarked readable at 4/4. |
| 12 | `openrouter/liquid/lfm-2.5-2.6b:free` | Verified compact fallback; benchmarked readable at 4/4. |
| 13 | `kilo-gateway/kilo-auto/free` | Verified provider-managed fallback; benchmarked readable at 4/4. |

No routing behavior is changed by this document. The proposal is ready to implement once approved.

## kilo-gateway (2)

| Model ID | Capability / role | Catalog tier | Direct evidence | Observed latency |
| --- | --- | --- | --- | ---: |
| `kilo-gateway/kilo-auto/free` | text-chat, general-chat | curated-gateway | HTTP 200; readable; 4/4 format score | 22896 ms |
| `kilo-gateway/nvidia/nemotron-3-super-120b-a12b:free` | text-chat, general-chat | curated-gateway | HTTP 200; readable; 4/4 format score | 14011 ms |

## opencode-zen (3)

| Model ID | Capability / role | Catalog tier | Direct evidence | Observed latency |
| --- | --- | --- | --- | ---: |
| `opencode-zen/mimo-v2.5-free` | text-chat, coding | curated-free | HTTP 200; readable; 4/4 format score | 9974 ms |
| `opencode-zen/hy3-free` | text-chat, coding | curated-free | HTTP 200; readable; 4/4 format score | 12918 ms |
| `opencode-zen/laguna-s-2.1-free` | text-chat, coding | curated-free | HTTP 200; readable; 4/4 format score | 10350 ms |

## openrouter (17)

| Model ID | Capability / role | Catalog tier | Direct evidence | Observed latency |
| --- | --- | --- | --- | ---: |
| `openrouter/liquid/lfm-2.5-2.6b:free` | text model | unclassified | HTTP 200; readable; 4/4 format score | 16066 ms |
| `openrouter/nvidia/nemotron-3.5-lightning:free` | text model | unclassified | Previous check: HTTP — | 120015 ms |
| `openrouter/thinkingmachines/inkling-small:free` | text model | unclassified | Previous check: HTTP 403 | 9956 ms |
| `openrouter/poolside/laguna-s-2.1:free` | text model | unclassified | Previous check: HTTP 503 | 4045 ms |
| `openrouter/thinkingmachines/inkling:free` | text model | unclassified | Previous check: HTTP 503 | 3457 ms |
| `openrouter/poolside/laguna-xs-2.1:free` | text model | unclassified | Previous check: HTTP 429 | 9114 ms |
| `openrouter/cohere/north-mini-code:free` | text model | unclassified | HTTP 200; readable; 4/4 format score | 9701 ms |
| `openrouter/z-ai/glm-5.2:free` | text model | unclassified | Previous check: HTTP 429 | 10297 ms |
| `openrouter/nvidia/nemotron-3.5-content-safety:free` | text model | unclassified | HTTP 200; readable; 0/4 format score | 10638 ms |
| `openrouter/minimax/minimax-m3:free` | text model | unclassified | HTTP 200; readable; 4/4 format score | 10040 ms |
| `openrouter/google/gemma-4-26b-a4b-it:free` | text model | unclassified | Previous check: HTTP 429 | 9311 ms |
| `openrouter/google/gemma-4-31b-it:free` | text model | unclassified | Previous check: HTTP 429 | 8325 ms |
| `openrouter/google/lyria-3-pro-preview` | text model | unclassified | Previous check: HTTP 502 | 11268 ms |
| `openrouter/google/lyria-3-clip-preview` | text model | unclassified | Previous check: HTTP 503 | 3926 ms |
| `openrouter/minimax/minimax-m2.7:free` | text model | unclassified | Previous check: HTTP 503 | 3857 ms |
| `openrouter/nvidia/nemotron-3-super-120b-a12b:free` | text model | unclassified | HTTP 200; readable; 4/4 format score | 11639 ms |
| `openrouter/free` | text model | unclassified | Previous check: HTTP 502 | 9544 ms |

## airforce (50)

| Model ID | Capability / role | Catalog tier | Direct evidence | Observed latency |
| --- | --- | --- | --- | ---: |
| `airforce/codestral-2508` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/codestral-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/devstral-2512` | chat | unclassified | HTTP 200; readable; 4/4 format score; catalog operational | 15855 ms |
| `airforce/devstral-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/devstral-medium-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/gemma-4-26b-a4b-it` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/gemma3-270m:free` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/glm-4.7-flash` | chat, streaming, tools | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/gpt-oss-120b` | chat, reasoning, streaming, tools | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/gpt-oss-20b` | chat, reasoning, streaming, tools | unclassified | HTTP 200; readable; 4/4 format score; catalog operational | 8671 ms |
| `airforce/kimi-k2.7-code` | chat, streaming | unclassified | HTTP 200; readable; 4/4 format score; catalog operational | 12560 ms |
| `airforce/llama-3.3-70b-instruct-fp8-fast` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/llama-4-scout-17b-16e-instruct` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/magistral-small-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/ministral-14b-2512` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/ministral-14b-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/ministral-3b-2512` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/ministral-3b-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/ministral-8b-2512` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/ministral-8b-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-code-agent-latest` | chat | unclassified | HTTP 200; readable; 4/4 format score; catalog operational | 3108 ms |
| `airforce/mistral-code-fim-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-code-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-large-2512` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-large-latest` | chat | unclassified | Previous check: HTTP operational; catalog operational | 70891 ms |
| `airforce/mistral-medium` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-medium-2505` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-medium-2508` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-medium-2604` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-medium-3` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-medium-3.5` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-medium-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-small-2506` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-small-2603` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-small-3.1-24b-instruct` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-small-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-tiny-2407` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-tiny-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-vibe-cli-fast` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-vibe-cli-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/mistral-vibe-cli-with-tools` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/open-mistral-nemo` | chat, streaming | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/open-mistral-nemo-2407` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/qwen3-30b-a3b-fp8` | chat, reasoning | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/rnj-1` | chat, streaming | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/suno-v4.5` | images | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/suno-v5` | images | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/unmoderated-gpt` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/voxtral-small-2507` | chat | unclassified | Not yet benchmarked; catalog operational | — |
| `airforce/voxtral-small-latest` | chat | unclassified | Not yet benchmarked; catalog operational | — |

## Source snapshots

- Live OmniRoute catalog captured after the Airforce integration.
- Original provider benchmark: 20-model sequential direct check.
- OpenRouter benchmark: 20-model sequential direct check before catalog filtering.
- Airforce benchmark: ten-model rate-limited direct check with at least 65 seconds between starts.
