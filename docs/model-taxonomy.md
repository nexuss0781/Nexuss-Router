# OmniRoute 240-Model Taxonomy

> This taxonomy covers the live model IDs returned by OmniRoute `/v1/models`. Capability and quality fields are conservative heuristics derived from model names, provider groups, and known naming signals. The provider metadata does not declare complete modality support, so entries marked low or medium confidence must be endpoint-probed before automatic production routing.

**Total:** 240 models

## Taxonomy dimensions

| Dimension | Meaning |
|---|---|
| Provider group | Gateway/provider namespace returned by OmniRoute |
| Source model | Model name after the G4F server prefix when present |
| Family | Model family inferred from the identifier |
| Modality | Intended request modality; not a provider guarantee |
| Task role | Primary likely use such as coding, reasoning, image creation, or audio |
| Quality tier | Routing-quality class, not a benchmark score |
| Priority | Suggested auto-routing band |
| Confidence | Confidence in the classification, not model quality |

## Summary by provider

| Provider | Models |
|---|---:|
| `g4f-pollinations` | 220 |
| `kilo-gateway` | 4 |
| `opencode-zen` | 7 |
| `pollinations` | 9 |

## Summary by modality

| Modality | Models |
|---|---:|
| `audio-generation` | 1 |
| `image-generation` | 9 |
| `moderation-safety` | 3 |
| `text-chat` | 216 |
| `text-chat-vision-candidate` | 11 |

## Summary by family

| Family | Models |
|---|---:|
| `Claude` | 6 |
| `DeepSeek` | 25 |
| `Flux/Image` | 6 |
| `Gemini/Google` | 26 |
| `GLM/Zhipu` | 15 |
| `GPT/OpenAI` | 35 |
| `Grok/xAI` | 8 |
| `Kimi` | 11 |
| `Llama/Meta` | 5 |
| `Luna/Laguna` | 3 |
| `MiniMax` | 9 |
| `Mistral` | 1 |
| `Nemotron/NVIDIA` | 14 |
| `Other Open Model` | 55 |
| `Qwen` | 21 |

## Summary by priority

| Priority | Models |
|---|---:|
| `P-specialized` | 13 |
| `P1-curated-free` | 7 |
| `P2-curated-gateway` | 4 |
| `P3-strong-candidate` | 133 |
| `P4-broad-community` | 66 |
| `P5-experimental` | 17 |

## Summary by confidence

| Confidence | Models |
|---|---:|
| `low` | 210 |
| `medium` | 30 |

## Provider: `g4f-pollinations`

| Model ID | Source model | Family | Modality | Role | Quality | Priority | Confidence |
|---|---|---|---|---|---|---|---|
| `g4f-pollinations/srv_mp5miql908c8738d71be:flux` | `srv_mp5miql908c8738d71be:flux` | `Flux/Image` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:dreamshaper` | `srv_mrdypihj16e8b1776409:dreamshaper` | `Flux/Image` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:flux` | `srv_mrdypihj16e8b1776409:flux` | `Flux/Image` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:midijourney` | `srv_mrdypihj16e8b1776409:midijourney` | `Flux/Image` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:zimage` | `srv_mrdypihj16e8b1776409:zimage` | `Flux/Image` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `srv_mrdypihj16e8b1776409:CloudCompile/agnes-image-2.0-flash` | `CloudCompile/agnes-image-2.0-flash` | `Flux/Image` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mkoqob5pfb6ff5ec61c2:gpt-audio` | `srv_mkoqob5pfb6ff5ec61c2:gpt-audio` | `GPT/OpenAI` | `audio-generation` | `audio` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gpt-image-2` | `srv_mrdypihj16e8b1776409:gpt-image-2` | `GPT/OpenAI` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gptimage` | `srv_mrdypihj16e8b1776409:gptimage` | `GPT/OpenAI` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gptimage-large` | `srv_mrdypihj16e8b1776409:gptimage-large` | `GPT/OpenAI` | `image-generation` | `image-creation` | `specialized` | `P-specialized` | `medium` |
| `srv_mkom688d57c76d8a3542:openai/gpt-oss-safeguard-20b` | `openai/gpt-oss-safeguard-20b` | `GPT/OpenAI` | `moderation-safety` | `safety-classification` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:qwen-safety` | `srv_mrdypihj16e8b1776409:qwen-safety` | `Qwen` | `moderation-safety` | `safety-classification` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_mt4quyfw26b0a700926a:qwen3-guard-8b` | `srv_mt4quyfw26b0a700926a:qwen3-guard-8b` | `Qwen` | `moderation-safety` | `safety-classification` | `specialized` | `P-specialized` | `medium` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:claude-sonnet-4` | `srv_msjkstt04622bf04c675:claude-sonnet-4` | `Claude` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:fxyz-claude` | `srv_msjkstt04622bf04c675:fxyz-claude` | `Claude` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:chigwell/claude-haiku-4-5` | `chigwell/claude-haiku-4-5` | `Claude` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:anthropic/claude-fable-5` | `anthropic/claude-fable-5` | `Claude` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:anthropic/claude-opus-4.8` | `anthropic/claude-opus-4.8` | `Claude` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:deepseek` | `srv_mrdypihj16e8b1776409:deepseek` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:deepseek-pro` | `srv_mrdypihj16e8b1776409:deepseek-pro` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:deepseek-v4-pro` | `srv_mrgynwuz08a167112109:deepseek-v4-pro` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgypezt91a1a4a8ea7f:deepseek-v4-flash` | `srv_mrgypezt91a1a4a8ea7f:deepseek-v4-flash` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrtd0gge48cb809ab7eb:deepseek-v4-flash` | `srv_mrtd0gge48cb809ab7eb:deepseek-v4-flash` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:fgpt-deepseek-v4-flash` | `srv_msjkstt04622bf04c675:fgpt-deepseek-v4-flash` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:oc-deepseek-v4-flash-free` | `srv_msjkstt04622bf04c675:oc-deepseek-v4-flash-free` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:deepseek-v4-flash` | `srv_mt1wbaxgf9c946af0c58:deepseek-v4-flash` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:deepseek-v4-pro` | `srv_mt1wbaxgf9c946af0c58:deepseek-v4-pro` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt4qsz48835de85d3492:DeepSeek-V4-Flash-0731` | `srv_mt4qsz48835de85d3492:DeepSeek-V4-Flash-0731` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt4quyfw26b0a700926a:deepseek-v4-flash` | `srv_mt4quyfw26b0a700926a:deepseek-v4-flash` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt4quyfw26b0a700926a:deepseek-v4-pro` | `srv_mt4quyfw26b0a700926a:deepseek-v4-pro` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:deepseek-ai/deepseek-v4-flash-0731` | `deepseek-ai/deepseek-v4-flash-0731` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mp2huzrg06e426ad12f3:deepseek-ai/DeepSeek-V4-Pro-0813` | `deepseek-ai/DeepSeek-V4-Pro-0813` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:JustScriptzz/deepseek-v4-pro-0813` | `JustScriptzz/deepseek-v4-pro-0813` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/deepseek-v4-flash` | `MarcosFRG/deepseek-v4-flash` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/deepseek-v4-pro` | `MarcosFRG/deepseek-v4-pro` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:Minor-fun/deepseek-v3.2` | `Minor-fun/deepseek-v3.2` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:vendouple/deepseek-v4-pro` | `vendouple/deepseek-v4-pro` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:voodoohop/anyvm-deepseek-chat` | `voodoohop/anyvm-deepseek-chat` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:deepseek/deepseek-v4-flash-free` | `deepseek/deepseek-v4-flash-free` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:deepseek/deepseek-v4-pro-0813` | `deepseek/deepseek-v4-pro-0813` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:deepseek/deepseek-v4-pro-free` | `deepseek/deepseek-v4-pro-free` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mp3lmkuad07322459f47:gemma3-270m:free` | `srv_mp3lmkuad07322459f47:gemma3-270m:free` | `Gemini/Google` | `text-chat-vision-candidate` | `vision-chat-candidate` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgy0nmbc8a86c407f17:gemini-3.5-flash` | `srv_mrgy0nmbc8a86c407f17:gemini-3.5-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgy0nmbc8a86c407f17:gemini-3.6-flash` | `srv_mrgy0nmbc8a86c407f17:gemini-3.6-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msgcl4vs6336675136db:gemma3:12b` | `srv_msgcl4vs6336675136db:gemma3:12b` | `Gemini/Google` | `text-chat-vision-candidate` | `vision-chat-candidate` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:gemini-2.5-pro` | `srv_msjkstt04622bf04c675:gemini-2.5-pro` | `Gemini/Google` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:gemini-3.6-flash` | `srv_msjkstt04622bf04c675:gemini-3.6-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:google/diffusiongemma-26b-a4b-it` | `google/diffusiongemma-26b-a4b-it` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:chigwell/gemini-3.1-flash-lite` | `chigwell/gemini-3.1-flash-lite` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:chigwell/gemini-3.7-flash` | `chigwell/gemini-3.7-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:gggff123/Gemini-3.7-Flash` | `gggff123/Gemini-3.7-Flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/gemini-2.5-flash-lite` | `MarcosFRG/gemini-2.5-flash-lite` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/gemma-4-26b-a4b` | `MarcosFRG/gemma-4-26b-a4b` | `Gemini/Google` | `text-chat-vision-candidate` | `vision-chat-candidate` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:vendouple/gemini-3.6` | `vendouple/gemini-3.6` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:YoannDev90/diffusiongemma-26b-a4b-it:free` | `YoannDev90/diffusiongemma-26b-a4b-it:free` | `Gemini/Google` | `text-chat` | `coding` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-2.5-flash` | `models/gemini-2.5-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-2.5-flash-lite` | `models/gemini-2.5-flash-lite` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-3-flash-preview` | `models/gemini-3-flash-preview` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-3.1-flash-lite` | `models/gemini-3.1-flash-lite` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-3.5-flash` | `models/gemini-3.5-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-3.6-flash` | `models/gemini-3.6-flash` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-robotics-er-1.6-preview` | `models/gemini-robotics-er-1.6-preview` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemma-4-26b-a4b-it` | `models/gemma-4-26b-a4b-it` | `Gemini/Google` | `text-chat-vision-candidate` | `vision-chat-candidate` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgy0nmbc8a86c407f17:models/gemma-4-31b-it` | `models/gemma-4-31b-it` | `Gemini/Google` | `text-chat-vision-candidate` | `vision-chat-candidate` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_moot47mj3e1855ad46d1:glm-5.2` | `srv_moot47mj3e1855ad46d1:glm-5.2` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:glm` | `srv_mrdypihj16e8b1776409:glm` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:glm-4.7` | `srv_mrgynwuz08a167112109:glm-4.7` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:glm-5.1` | `srv_mrgynwuz08a167112109:glm-5.1` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:glm-5.1-thinking` | `srv_mrgynwuz08a167112109:glm-5.1-thinking` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:glm-5.2` | `srv_mrgynwuz08a167112109:glm-5.2` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:glm-5.2-thinking` | `srv_mrgynwuz08a167112109:glm-5.2-thinking` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgypezt91a1a4a8ea7f:glm-5.2-venice` | `srv_mrgypezt91a1a4a8ea7f:glm-5.2-venice` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:glm-5-2` | `srv_mt1wbaxgf9c946af0c58:glm-5-2` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mp2huzrg06e426ad12f3:zai-org/GLM-5.2` | `zai-org/GLM-5.2` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mp5miql908c8738d71be:MarcosFRG/glm-4.6v-flash` | `MarcosFRG/glm-4.6v-flash` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:gggff123/Glm-5.3` | `gggff123/Glm-5.3` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:JustScriptzz/glm-5.2` | `JustScriptzz/glm-5.2` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgynwuz08a167112109:zai-org/GLM-5.1-FP8` | `zai-org/GLM-5.1-FP8` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:z-ai/glm-5.3` | `z-ai/glm-5.3` | `GLM/Zhipu` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/openai` | `openai` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/openai-fast` | `openai-fast` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mp3lmkuad07322459f47:gpt-oss-20b` | `srv_mp3lmkuad07322459f47:gpt-oss-20b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mp5miql908c8738d71be:openai-fast` | `srv_mp5miql908c8738d71be:openai-fast` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gpt-5.4` | `srv_mrdypihj16e8b1776409:gpt-5.4` | `GPT/OpenAI` | `text-chat-vision-candidate` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gpt-5.6-luna` | `srv_mrdypihj16e8b1776409:gpt-5.6-luna` | `GPT/OpenAI` | `text-chat-vision-candidate` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gpt-5.6-sol` | `srv_mrdypihj16e8b1776409:gpt-5.6-sol` | `GPT/OpenAI` | `text-chat-vision-candidate` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gpt-5.6-terra` | `srv_mrdypihj16e8b1776409:gpt-5.6-terra` | `GPT/OpenAI` | `text-chat-vision-candidate` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:gpt-oss` | `srv_mrdypihj16e8b1776409:gpt-oss` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:openai` | `srv_mrdypihj16e8b1776409:openai` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:openai-fast` | `srv_mrdypihj16e8b1776409:openai-fast` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgypezt91a1a4a8ea7f:gpt-5.2` | `srv_mrgypezt91a1a4a8ea7f:gpt-5.2` | `GPT/OpenAI` | `text-chat-vision-candidate` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msgbae6y120ad415d4bf:gpt-oss:120b` | `srv_msgbae6y120ad415d4bf:gpt-oss:120b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msgbbrytbac5e2fa17e1:gpt-oss:20b` | `srv_msgbbrytbac5e2fa17e1:gpt-oss:20b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msgcmvfuf9ab80c4493f:gpt-oss:20b` | `srv_msgcmvfuf9ab80c4493f:gpt-oss:20b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:gpt-5.2` | `srv_msjkstt04622bf04c675:gpt-5.2` | `GPT/OpenAI` | `text-chat-vision-candidate` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:openai-fast` | `srv_msjkstt04622bf04c675:openai-fast` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt5bgbno5c8274425e45:qwen3.8:27b` | `srv_mt5bgbno5c8274425e45:qwen3.8:27b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkom688d57c76d8a3542:openai/gpt-oss-120b` | `openai/gpt-oss-120b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkom688d57c76d8a3542:openai/gpt-oss-20b` | `openai/gpt-oss-20b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:openai/gpt-oss-120b` | `openai/gpt-oss-120b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:openai/gpt-oss-20b` | `openai/gpt-oss-20b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mp5miql908c8738d71be:chirag-gamer/gpt-oss-120b` | `chirag-gamer/gpt-oss-120b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:chirag-gamer/gpt-oss-120b` | `chirag-gamer/gpt-oss-120b` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:grok-4.20-0309-non-reasoning` | `srv_mrgynwuz08a167112109:grok-4.20-0309-non-reasoning` | `Grok/xAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:grok-4.3` | `srv_mrgynwuz08a167112109:grok-4.3` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:fgpt-grok-4-3` | `srv_msjkstt04622bf04c675:fgpt-grok-4-3` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:fxyz-grok` | `srv_msjkstt04622bf04c675:fxyz-grok` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:grok-4-fast` | `srv_msjkstt04622bf04c675:grok-4-fast` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:chigwell/grok-4.6` | `chigwell/grok-4.6` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:JustScriptzz/grok-4.6` | `JustScriptzz/grok-4.6` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:kimi-code` | `srv_mrdypihj16e8b1776409:kimi-code` | `Kimi` | `text-chat` | `coding` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:kimi-k3` | `srv_mrgynwuz08a167112109:kimi-k3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:crowllm:kimi-k3` | `srv_mt1wbaxgf9c946af0c58:crowllm:kimi-k3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:DeepInfra:kimi-k3` | `srv_mt1wbaxgf9c946af0c58:DeepInfra:kimi-k3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:kimi-k3` | `srv_mt1wbaxgf9c946af0c58:kimi-k3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:moonshotai/kimi-k3` | `moonshotai/kimi-k3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:JustScriptzz/kimi-k3` | `JustScriptzz/kimi-k3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:sharktide/inferenceport-ai-kimi-k2.7-code` | `sharktide/inferenceport-ai-kimi-k2.7-code` | `Kimi` | `text-chat` | `coding` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:vendouple/kimi-k2.6` | `vendouple/kimi-k2.6` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgynwuz08a167112109:moonshotai/Kimi-K2.5` | `moonshotai/Kimi-K2.5` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgynwuz08a167112109:moonshotai/Kimi-K3` | `moonshotai/Kimi-K3` | `Kimi` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:minimax` | `srv_mrdypihj16e8b1776409:minimax` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:minimax-m2.7` | `srv_mrdypihj16e8b1776409:minimax-m2.7` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgynwuz08a167112109:minimax-m3` | `srv_mrgynwuz08a167112109:minimax-m3` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mshic8yn3b1e37aa77d5:minimax-m3:cloud` | `srv_mshic8yn3b1e37aa77d5:minimax-m3:cloud` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt4qsz48835de85d3492:minimax-m2.7` | `srv_mt4qsz48835de85d3492:minimax-m2.7` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:minimaxai/minimax-m3` | `minimaxai/minimax-m3` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/minimax-m3` | `MarcosFRG/minimax-m3` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:sharktide/inferenceport-ai-minimax-m3` | `sharktide/inferenceport-ai-minimax-m3` | `MiniMax` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:qwen-coder` | `srv_mrdypihj16e8b1776409:qwen-coder` | `Qwen` | `text-chat` | `coding` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:qwen3.8-2.4t-a95b` | `srv_mrdypihj16e8b1776409:qwen3.8-2.4t-a95b` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgxthn5dfa6e2f0a5b6:qwen3.7-plus` | `srv_mrgxthn5dfa6e2f0a5b6:qwen3.7-plus` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mrgymq8534d9ea96920d:qwen3.7-plus` | `srv_mrgymq8534d9ea96920d:qwen3.7-plus` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msgcl4vs6336675136db:qwen3:8b` | `srv_msgcl4vs6336675136db:qwen3:8b` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:fxyz-qwen` | `srv_msjkstt04622bf04c675:fxyz-qwen` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:qwen3-8-27b` | `srv_mt1wbaxgf9c946af0c58:qwen3-8-27b` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkom688d57c76d8a3542:qwen/qwen3.6-27b` | `qwen/qwen3.6-27b` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrdypihj16e8b1776409:sharktide/inferenceport-ai-qwen-3.6-27b` | `sharktide/inferenceport-ai-qwen-3.6-27b` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mrgynwuz08a167112109:qwen/qwen3.6-27b` | `qwen/qwen3.6-27b` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_msoxsh206cb0d89eca32:qwen/qwen3.8-max` | `qwen/qwen3.8-max` | `Qwen` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `srv_mkombumpae45db46dcb8:meta/llama-3.1-70b-instruct` | `meta/llama-3.1-70b-instruct` | `Llama/Meta` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:meta/llama-3.1-8b-instruct` | `meta/llama-3.1-8b-instruct` | `Llama/Meta` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:meta/llama-3.2-1b-instruct` | `meta/llama-3.2-1b-instruct` | `Llama/Meta` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:meta/muse-glimmer-30b` | `meta/muse-glimmer-30b` | `Llama/Meta` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:laguna-s` | `srv_msjkstt04622bf04c675:laguna-s` | `Luna/Laguna` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:vendouple/laguna-s-2.1:free` | `vendouple/laguna-s-2.1:free` | `Luna/Laguna` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mrgykg8eea645e7bb006:nemotron-3-nano:30b` | `srv_mrgykg8eea645e7bb006:nemotron-3-nano:30b` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:nemotron-ultra` | `srv_msjkstt04622bf04c675:nemotron-ultra` | `Nemotron/NVIDIA` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:oc-nemotron-3-ultra-free` | `srv_msjkstt04622bf04c675:oc-nemotron-3-ultra-free` | `Nemotron/NVIDIA` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mt4quyfw26b0a700926a:nemotron-3.5-lightning-30b` | `srv_mt4quyfw26b0a700926a:nemotron-3.5-lightning-30b` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:nvidia/nemotron-3-nano-30b-a3b` | `nvidia/nemotron-3-nano-30b-a3b` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:nvidia/nemotron-3-super-120b-a12b` | `nvidia/nemotron-3-super-120b-a12b` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3-ultra-550b-a55b` | `Nemotron/NVIDIA` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:nvidia/nemotron-3.5-lightning-30b-a3b` | `nvidia/nemotron-3.5-lightning-30b-a3b` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:nvidia/nvidia-nemotron-nano-9b-v2` | `nvidia/nvidia-nemotron-nano-9b-v2` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_monk1pkz433a519ff2be:nvidia/nemotron-3.5-lightning:free` | `nvidia/nemotron-3.5-lightning:free` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/nemotron-3.5-lightning-30b` | `MarcosFRG/nemotron-3.5-lightning-30b` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/auto` | `auto` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mkom688d57c76d8a3542:allam-2-7b` | `srv_mkom688d57c76d8a3542:allam-2-7b` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mkopv2kp2e0038cdf550:turbo` | `srv_mkopv2kp2e0038cdf550:turbo` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:command-a-plus` | `srv_mrdypihj16e8b1776409:command-a-plus` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:klein` | `srv_mrdypihj16e8b1776409:klein` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:perplexity-fast` | `srv_mrdypihj16e8b1776409:perplexity-fast` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:perplexity-reasoning` | `srv_mrdypihj16e8b1776409:perplexity-reasoning` | `Other Open Model` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mrdypihj16e8b1776409:sana` | `srv_mrdypihj16e8b1776409:sana` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msgclghj4daadc36d8aa:granite4.1:8b` | `srv_msgclghj4daadc36d8aa:granite4.1:8b` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:fxyz-perplexity-search` | `srv_msjkstt04622bf04c675:fxyz-perplexity-search` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:oc-ling-3-0-flash-free` | `srv_msjkstt04622bf04c675:oc-ling-3-0-flash-free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:oc-mimo-v2-5-free` | `srv_msjkstt04622bf04c675:oc-mimo-v2-5-free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:stepfun-step-37-flash` | `srv_msjkstt04622bf04c675:stepfun-step-37-flash` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:toolbaz-v4.5-fast` | `srv_msjkstt04622bf04c675:toolbaz-v4.5-fast` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:kat-coder-pro-v2.5` | `srv_mt1wbaxgf9c946af0c58:kat-coder-pro-v2.5` | `Other Open Model` | `text-chat` | `coding` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mt4quyfw26b0a700926a:mimo-v2.5` | `srv_mt4quyfw26b0a700926a:mimo-v2.5` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_mt52nnuh2ab2cda70978:big-pickle` | `srv_mt52nnuh2ab2cda70978:big-pickle` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkom688d57c76d8a3542:groq/compound` | `groq/compound` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkom688d57c76d8a3542:groq/compound-mini` | `groq/compound-mini` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mkombumpae45db46dcb8:thinkingmachines/inkling` | `thinkingmachines/inkling` | `Other Open Model` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_monk1pkz433a519ff2be:openrouter/free` | `openrouter/free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_monk1pkz433a519ff2be:stealth/ox-alpha` | `stealth/ox-alpha` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mp5miql908c8738d71be:chigwell/llm7-fast` | `chigwell/llm7-fast` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mp5miql908c8738d71be:pegalink/ox-alpha` | `pegalink/ox-alpha` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mp5miql908c8738d71be:pegalink/ox-alpha-agent` | `pegalink/ox-alpha-agent` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mp5miql908c8738d71be:Spit-fires/muse-glimmer` | `Spit-fires/muse-glimmer` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mp5miql908c8738d71be:vendouple/ox-alpha` | `vendouple/ox-alpha` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mp5miql908c8738d71be:YoannDev90/muse-glimmer-30b:free` | `YoannDev90/muse-glimmer-30b:free` | `Other Open Model` | `text-chat` | `coding` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mqjxnj9i4e35281e8d60:koboldcpp/magnum-v4-12b-Q4_K_M` | `koboldcpp/magnum-v4-12b-Q4_K_M` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:Catniti/agnes-2.5-flash` | `Catniti/agnes-2.5-flash` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:chigwell/llm7-fast` | `chigwell/llm7-fast` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:gggff123/Inkling` | `gggff123/Inkling` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:gggff123/step-3.7-flash` | `gggff123/step-3.7-flash` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:JustScriptzz/moondream-3.1` | `JustScriptzz/moondream-3.1` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:MarcosFRG/mimo-v2.5` | `MarcosFRG/mimo-v2.5` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:mikl-shortcuts/ministral-3` | `mikl-shortcuts/ministral-3` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:sharktide/inferenceport-ai-codestral-2508` | `sharktide/inferenceport-ai-codestral-2508` | `Other Open Model` | `text-chat` | `coding` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:solarnode-developement/hy3` | `solarnode-developement/hy3` | `Other Open Model` | `text-chat` | `coding` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:vendouple/muse-glimmer-30b:free` | `vendouple/muse-glimmer-30b:free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mrdypihj16e8b1776409:voodoohop/airforce-doubao-pro` | `voodoohop/airforce-doubao-pro` | `Other Open Model` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_msgckvod661adcf0fff2:richardyoung/olmocr2:7b-q8` | `richardyoung/olmocr2:7b-q8` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_msjekdik2f3768a4ee42:kilo-auto/free` | `kilo-auto/free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_msjekdik2f3768a4ee42:openrouter/free` | `openrouter/free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_msjekdik2f3768a4ee42:tencent/hy3:free` | `tencent/hy3:free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_msoxsh206cb0d89eca32:orcarouter/free` | `orcarouter/free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `srv_mt58lf608d01990edc9b:kilo-auto/free` | `kilo-auto/free` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `g4f-pollinations/srv_msg68ooo8baffd1a6509:qwen3.5-40b-deckard-claude46:latest` | `srv_msg68ooo8baffd1a6509:qwen3.5-40b-deckard-claude46:latest` | `Claude` | `text-chat` | `reasoning-general` | `community-experimental` | `P5-experimental` | `medium` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-flash-latest` | `models/gemini-flash-latest` | `Gemini/Google` | `text-chat` | `general-chat` | `community-experimental` | `P5-experimental` | `medium` |
| `srv_mrgy0nmbc8a86c407f17:models/gemini-flash-lite-latest` | `models/gemini-flash-lite-latest` | `Gemini/Google` | `text-chat` | `general-chat` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msg68ooo8baffd1a6509:deepseek-r1-32b-abliterated:latest` | `srv_msg68ooo8baffd1a6509:deepseek-r1-32b-abliterated:latest` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msg68ooo8baffd1a6509:glm-4.7-heretic-uncensored:latest` | `srv_msg68ooo8baffd1a6509:glm-4.7-heretic-uncensored:latest` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msg6a4jw30fd44d2d156:gpt-oss:latest` | `srv_msg6a4jw30fd44d2d156:gpt-oss:latest` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msgb4yuoddb1b88c97af:gpt-oss:latest` | `srv_msgb4yuoddb1b88c97af:gpt-oss:latest` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msg6938v04914c4c04d2:llama3:latest` | `srv_msg6938v04914c4c04d2:llama3:latest` | `Llama/Meta` | `text-chat` | `general-chat` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_mp3lmkuad07322459f47:unmoderated-gpt` | `srv_mp3lmkuad07322459f47:unmoderated-gpt` | `Other Open Model` | `text-chat` | `experimental-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msgckjs9c22150d27d5a:MADRSbot:latest` | `srv_msgckjs9c22150d27d5a:MADRSbot:latest` | `Other Open Model` | `text-chat` | `general-chat` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_moot47mj3e1855ad46d1:qwen-plus-latest` | `srv_moot47mj3e1855ad46d1:qwen-plus-latest` | `Qwen` | `text-chat` | `general-chat` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_mqjxnj9i4e35281e8d60:Qwen3.5-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` | `srv_mqjxnj9i4e35281e8d60:Qwen3.5-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` | `Qwen` | `text-chat` | `experimental-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_mqjxnj9i4e35281e8d60:Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` | `srv_mqjxnj9i4e35281e8d60:Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` | `Qwen` | `text-chat` | `experimental-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msgcn3zj3b870bfa005c:qwen3-norm:latest` | `srv_msgcn3zj3b870bfa005c:qwen3-norm:latest` | `Qwen` | `text-chat` | `general-chat` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:sw-qwen3-5-35b-uncensored` | `srv_msjkstt04622bf04c675:sw-qwen3-5-35b-uncensored` | `Qwen` | `text-chat` | `experimental-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_msjkstt04622bf04c675:sw-qwen3-6-35b-uncensored` | `srv_msjkstt04622bf04c675:sw-qwen3-6-35b-uncensored` | `Qwen` | `text-chat` | `experimental-general` | `community-experimental` | `P5-experimental` | `medium` |
| `g4f-pollinations/srv_mt1wbaxgf9c946af0c58:Qwen3.6-35B-A3B-Uncensored` | `srv_mt1wbaxgf9c946af0c58:Qwen3.6-35B-A3B-Uncensored` | `Qwen` | `text-chat` | `experimental-general` | `community-experimental` | `P5-experimental` | `medium` |

## Provider: `kilo-gateway`

| Model ID | Source model | Family | Modality | Role | Quality | Priority | Confidence |
|---|---|---|---|---|---|---|---|
| `minimax/minimax-m2.5:free` | `minimax-m2.5:free` | `MiniMax` | `text-chat` | `general-chat` | `curated-gateway` | `P2-curated-gateway` | `low` |
| `nvidia/nemotron-3-super-120b-a12b:free` | `nemotron-3-super-120b-a12b:free` | `Nemotron/NVIDIA` | `text-chat` | `general-chat` | `curated-gateway` | `P2-curated-gateway` | `low` |
| `arcee-ai/trinity-large-preview:free` | `trinity-large-preview:free` | `Other Open Model` | `text-chat` | `general-chat` | `curated-gateway` | `P2-curated-gateway` | `low` |
| `kilo-auto/free` | `free` | `Other Open Model` | `text-chat` | `general-chat` | `curated-gateway` | `P2-curated-gateway` | `low` |

## Provider: `opencode-zen`

| Model ID | Source model | Family | Modality | Role | Quality | Priority | Confidence |
|---|---|---|---|---|---|---|---|
| `opencode-zen/deepseek-v4-flash-free` | `deepseek-v4-flash-free` | `DeepSeek` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |
| `opencode-zen/laguna-s-2.1-free` | `laguna-s-2.1-free` | `Luna/Laguna` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |
| `opencode-zen/nemotron-3-ultra-free` | `nemotron-3-ultra-free` | `Nemotron/NVIDIA` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |
| `opencode-zen/nemotron-3.5-lightning-free` | `nemotron-3.5-lightning-free` | `Nemotron/NVIDIA` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |
| `opencode-zen/big-pickle` | `big-pickle` | `Other Open Model` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |
| `opencode-zen/hy3-free` | `hy3-free` | `Other Open Model` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |
| `opencode-zen/mimo-v2.5-free` | `mimo-v2.5-free` | `Other Open Model` | `text-chat` | `coding` | `curated-free` | `P1-curated-free` | `low` |

## Provider: `pollinations`

| Model ID | Source model | Family | Modality | Role | Quality | Priority | Confidence |
|---|---|---|---|---|---|---|---|
| `pollinations/deepseek` | `deepseek` | `DeepSeek` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `pollinations/gemini-flash-lite-3.1` | `gemini-flash-lite-3.1` | `Gemini/Google` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `pollinations/openai-fast` | `openai-fast` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `pollinations/openai-large` | `openai-large` | `GPT/OpenAI` | `text-chat` | `reasoning-general` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `pollinations/grok` | `grok` | `Grok/xAI` | `text-chat` | `general-chat` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `pollinations/qwen-coder` | `qwen-coder` | `Qwen` | `text-chat` | `coding` | `strong-candidate` | `P3-strong-candidate` | `low` |
| `pollinations/mistral` | `mistral` | `Mistral` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `pollinations/perplexity-fast` | `perplexity-fast` | `Other Open Model` | `text-chat` | `general-chat` | `community-unknown` | `P4-broad-community` | `low` |
| `pollinations/perplexity-reasoning` | `perplexity-reasoning` | `Other Open Model` | `text-chat` | `reasoning-general` | `community-unknown` | `P4-broad-community` | `low` |
