// GENERATED from the OpenRouter catalog on 2026-09-25. Source: GET /api/v1/models
// (unauthenticated) + GET /api/v1/models/{canonical_slug}/endpoints.
// Descriptions are the provider's own catalog text, reproduced verbatim.
// Re-run scripts/providers-sync.mjs to refresh; do not hand-edit the description fields.

export type ProviderSite = {
  slug: string;
  name: string;
  website: string;
  termsOfServiceUrl: string | null;
  statusPageUrl: string | null;
  /** true when the website was confirmed by the provider's own published URL, not inferred */
  domainVerified: boolean;
};

export type OpenRouterModelDetail = {
  modelId: string;
  displayName: string;
  description: string;
  /** The lab that released the weights, and its official site. */
  owner: { name: string; website: string; huggingFaceOrg: string | null };
  canonicalSlug: string | null;
  huggingFaceId: string | null;
  providerBaseModel: string | null;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  inputModalities: string[];
  outputModalities: string[];
  tokenizer: string | null;
  supportedParameters: string[];
  reasoning: { mandatory: boolean; defaultEnabled: boolean; supportedEfforts: string[]; defaultEffort: string | null; supportsMaxTokens: boolean };
  defaultParameters: Record<string, number | null>;
  moderationApplied: boolean;
  upstreams: string[];
  quantization: string[];
  upstreamUptime30mMax: number | null;
  upstreamEndpointCount: number;
  knowledgeCutoff: string | null;
  expirationDate: string | null;
  perRequestLimits: Record<string, unknown> | null;
  created: number;
};

export const OPENROUTER_MODEL_DETAILS: Record<string, OpenRouterModelDetail> = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    modelId: "nvidia/nemotron-3-ultra-550b-a55b:free",
    owner: { name: "NVIDIA", website: "https://www.nvidia.com", huggingFaceOrg: "nvidia" },
    displayName: "NVIDIA: Nemotron 3 Ultra (free)",
    description: "NVIDIA Nemotron 3 Ultra is an open frontier-reasoning and orchestration model from NVIDIA, with 55B active parameters out of 550B total (MoE). Built on a hybrid Transformer-Mamba mixture-of-experts architecture, it...",
    canonicalSlug: "nvidia/nemotron-3-ultra-550b-a55b-20260604",
    huggingFaceId: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16",
    providerBaseModel: "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16",
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["include_reasoning", "max_tokens", "reasoning", "reasoning_effort", "seed", "temperature", "tool_choice", "tools", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ["high", "medium"],
      defaultEffort: "high",
      supportsMaxTokens: true,
    },
    defaultParameters: {"temperature": 1, "top_p": 0.95, "top_k": null, "frequency_penalty": null, "presence_penalty": null, "repetition_penalty": null},
    moderationApplied: false,
    upstreams: ["BaseTen", "DeepInfra", "Venice"],
    quantization: ["fp4", "fp8"],
    upstreamUptime30mMax: 100,
    upstreamEndpointCount: 4,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1780551208,
  },
  "poolside/laguna-xs-2.1:free": {
    modelId: "poolside/laguna-xs-2.1:free",
    owner: { name: "Poolside", website: "https://poolside.ai", huggingFaceOrg: "poolside" },
    displayName: "Poolside: Laguna XS 2.1 (free)",
    description: "Laguna XS 2.1 is the latest coding agent model in the 33B-A3B category from [Poolside](https://poolside.ai/) and a step forward from their Laguna XS.2 model (released in April 2026). It combines...",
    canonicalSlug: "poolside/laguna-xs-2.1-20260625",
    huggingFaceId: "poolside/Laguna-XS-2.1",
    providerBaseModel: "poolside/Laguna-XS-2.1",
    contextLength: 262144,
    maxCompletionTokens: 32768,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["include_reasoning", "max_tokens", "reasoning", "temperature", "tool_choice", "tools"],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: false,
    },
    defaultParameters: {},
    moderationApplied: false,
    upstreams: ["Poolside"],
    quantization: ["fp8"],
    upstreamUptime30mMax: 100,
    upstreamEndpointCount: 1,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1783002429,
  },
  "inclusionai/ling-3.0-flash-sante:free": {
    modelId: "inclusionai/ling-3.0-flash-sante:free",
    owner: { name: "InclusionAI", website: "https://inclusionai.org", huggingFaceOrg: "inclusionAI" },
    displayName: "inclusionAI: Ling 3.0 Flash Sante (free)",
    description: "Ling 3.0 Flash Sante is a health and medicine-focused mixture-of-experts model from InclusionAI, built on Ling 3.0 Flash with 5.1B active parameters out of 124B total. It is designed for...",
    canonicalSlug: "inclusionai/ling-3.0-flash-sante-20260904",
    huggingFaceId: null,
    providerBaseModel: "inclusionai/ling-3.0-flash-sante-20260904",
    contextLength: 262144,
    maxCompletionTokens: 32768,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["frequency_penalty", "include_reasoning", "logprobs", "max_tokens", "presence_penalty", "reasoning", "repetition_penalty", "seed", "stop", "temperature", "tool_choice", "tools", "top_k", "top_logprobs", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: false,
    },
    defaultParameters: {},
    moderationApplied: false,
    upstreams: [],
    quantization: [],
    upstreamUptime30mMax: null,
    upstreamEndpointCount: 0,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1788545946,
  },
  "inclusionai/ling-3.0-flash-fin:free": {
    modelId: "inclusionai/ling-3.0-flash-fin:free",
    owner: { name: "InclusionAI", website: "https://inclusionai.org", huggingFaceOrg: "inclusionAI" },
    displayName: "inclusionAI: Ling 3.0 Flash Fin (free)",
    description: "Ling 3.0 Flash Fin is a finance-focused mixture-of-experts model from InclusionAI, built on Ling 3.0 Flash with 5.1B active parameters out of 124B total. It is designed for real-world investment...",
    canonicalSlug: "inclusionai/ling-3.0-flash-fin-20260827",
    huggingFaceId: null,
    providerBaseModel: "inclusionai/ling-3.0-flash-fin-20260827",
    contextLength: 262144,
    maxCompletionTokens: 32768,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["frequency_penalty", "include_reasoning", "logprobs", "max_tokens", "presence_penalty", "reasoning", "repetition_penalty", "seed", "stop", "temperature", "tool_choice", "tools", "top_k", "top_logprobs", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: false,
    },
    defaultParameters: {},
    moderationApplied: false,
    upstreams: ["DeepInfra"],
    quantization: ["fp4"],
    upstreamUptime30mMax: 100,
    upstreamEndpointCount: 1,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1787846290,
  },
  "cohere/north-mini-code:free": {
    modelId: "cohere/north-mini-code:free",
    owner: { name: "Cohere", website: "https://cohere.com", huggingFaceOrg: "CohereLabs" },
    displayName: "Cohere: North Mini Code (free)",
    description: "North Mini Code is Cohere's first agentic coding model and the debut of its North family. A sparse mixture-of-experts model with 30B total parameters and 3B active, it is optimized...",
    canonicalSlug: "cohere/north-mini-code-20260617",
    huggingFaceId: "CohereLabs/North-Mini-Code-1.0",
    providerBaseModel: "CohereLabs/North-Mini-Code-1.0",
    contextLength: 256000,
    maxCompletionTokens: 64000,
    inputModalities: ["text"],
    outputModalities: ["text"],
    tokenizer: "Cohere",
    supportedParameters: ["frequency_penalty", "include_reasoning", "max_tokens", "presence_penalty", "reasoning", "seed", "stop", "temperature", "tool_choice", "tools", "top_k", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: false,
    },
    defaultParameters: {"temperature": null, "top_p": null, "top_k": null, "frequency_penalty": null, "presence_penalty": null, "repetition_penalty": null},
    moderationApplied: true,
    upstreams: [],
    quantization: [],
    upstreamUptime30mMax: null,
    upstreamEndpointCount: 0,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1781723748,
  },
  "dots-studio/dots-3-note-preview:free": {
    modelId: "dots-studio/dots-3-note-preview:free",
    owner: { name: "Dots Studio", website: "https://dots.studio", huggingFaceOrg: "dots-studio" },
    displayName: "Dots Studio: Dots3-Note Preview (free)",
    description: "Dots3-Note Preview is an open-weight mixture-of-experts model from Dots Studio, with 16B active parameters out of 280B total. It is the lightest model in the Dots 3 family and is...",
    canonicalSlug: "dots-studio/dots-3-note-preview-20260813",
    huggingFaceId: null,
    providerBaseModel: "dots-studio/dots-3-note-preview-20260813",
    contextLength: 512000,
    maxCompletionTokens: 460800,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["include_reasoning", "max_tokens", "reasoning", "response_format", "structured_outputs", "temperature", "tool_choice", "tools", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: false,
    },
    defaultParameters: {},
    moderationApplied: false,
    upstreams: [],
    quantization: [],
    upstreamUptime30mMax: null,
    upstreamEndpointCount: 0,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1786680361,
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
    modelId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    owner: { name: "NVIDIA", website: "https://www.nvidia.com", huggingFaceOrg: "nvidia" },
    displayName: "NVIDIA: Nemotron 3 Nano Omni (free)",
    description: "NVIDIA Nemotron\u2122 3 Nano Omni is a 30B-A3B open multimodal model designed to function as a perception and context sub-agent in enterprise agent systems. It accepts text, image, video, and...",
    canonicalSlug: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-20260428",
    huggingFaceId: "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16",
    providerBaseModel: "nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16",
    contextLength: 256000,
    maxCompletionTokens: 65536,
    inputModalities: ["text", "audio", "image", "video"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["include_reasoning", "max_tokens", "reasoning", "seed", "temperature", "tool_choice", "tools", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: true,
    },
    defaultParameters: {"temperature": 0.6, "top_p": 0.95, "top_k": null, "frequency_penalty": null, "presence_penalty": null, "repetition_penalty": null},
    moderationApplied: false,
    upstreams: [],
    quantization: [],
    upstreamUptime30mMax: null,
    upstreamEndpointCount: 0,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1777393095,
  },
  "nvidia/nemotron-3.5-content-safety:free": {
    modelId: "nvidia/nemotron-3.5-content-safety:free",
    owner: { name: "NVIDIA", website: "https://www.nvidia.com", huggingFaceOrg: "nvidia" },
    displayName: "NVIDIA: Nemotron 3.5 Content Safety (free)",
    description: "NVIDIA Nemotron 3.5 Content Safety is a compact 4B-parameter multimodal guardrail model from NVIDIA, fine-tuned from Google Gemma-3-4B. It moderates both inputs to and responses from LLMs and VLMs, accepting...",
    canonicalSlug: "nvidia/nemotron-3.5-content-safety-20260604",
    huggingFaceId: "nvidia/Nemotron-3.5-Content-Safety",
    providerBaseModel: "nvidia/Nemotron-3.5-Content-Safety",
    contextLength: 128000,
    maxCompletionTokens: 8192,
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    tokenizer: "Other",
    supportedParameters: ["include_reasoning", "max_tokens", "reasoning", "seed", "temperature", "top_p"],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: [],
      defaultEffort: null,
      supportsMaxTokens: false,
    },
    defaultParameters: {"temperature": null, "top_p": null, "top_k": null, "frequency_penalty": null, "presence_penalty": null, "repetition_penalty": null},
    moderationApplied: false,
    upstreams: ["DeepInfra"],
    quantization: ["bf16"],
    upstreamUptime30mMax: null,
    upstreamEndpointCount: 1,
    knowledgeCutoff: null,
    expirationDate: null,
    perRequestLimits: null,
    created: 1780581864,
  },
};

/** Upstream inference providers actually serving the take list, with the official site for each. */
export const OPENROUTER_UPSTREAM_SITES: Record<string, ProviderSite> = {
  baseten: { slug: 'baseten', name: 'BaseTen', website: 'https://www.baseten.co',
    termsOfServiceUrl: 'https://www.baseten.co/terms', statusPageUrl: 'https://status.baseten.co', domainVerified: true },
  deepinfra: { slug: 'deepinfra', name: 'DeepInfra', website: 'https://deepinfra.com',
    termsOfServiceUrl: 'https://deepinfra.com/terms', statusPageUrl: 'https://status.deepinfra.com', domainVerified: true },
  poolside: { slug: 'poolside', name: 'Poolside', website: 'https://poolside.ai',
    termsOfServiceUrl: 'https://poolside.ai/terms', statusPageUrl: null, domainVerified: true },
  venice: { slug: 'venice', name: 'Venice', website: 'https://venice.ai',
    termsOfServiceUrl: 'https://venice.ai/terms', statusPageUrl: null, domainVerified: true },
};

export function listOpenRouterOwners(): { name: string; website: string }[] {
  const seen = new Map<string, { name: string; website: string }>();
  for (const detail of Object.values(OPENROUTER_MODEL_DETAILS)) {
    seen.set(detail.owner.name, { name: detail.owner.name, website: detail.owner.website });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// B2 taxonomy rows. modality stays "text-chat" on every vision-capable model until B4.1/B4.2
// pass: the catalog declares image input but no image was ever sent, so B4.5 forbids
// "text-chat-vision-candidate" here. confidence is "low" for all eight because the
// CRITERIA.md section 3 evidence bar (>=20 requests, >=3 windows, committed script) is unmet.
export const OPENROUTER_METADATA_ROWS: Record<string, {
  family: string; modality: string; task_role: string; quality_tier: string;
  priority: string; confidence: string; taxonomy_source: "live-openrouter";
}> = {
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free": { family: "Nemotron/NVIDIA", modality: "text-chat", task_role: "reasoning-general",
    quality_tier: "curated-free", priority: "P1-curated-free", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/poolside/laguna-xs-2.1:free": { family: "Poolside", modality: "text-chat", task_role: "coding",
    quality_tier: "curated-free", priority: "P1-curated-free", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/inclusionai/ling-3.0-flash-sante:free": { family: "InclusionAI", modality: "text-chat", task_role: "general-chat",
    quality_tier: "specialized", priority: "P-specialized", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/inclusionai/ling-3.0-flash-fin:free": { family: "InclusionAI", modality: "text-chat", task_role: "general-chat",
    quality_tier: "specialized", priority: "P-specialized", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/cohere/north-mini-code:free": { family: "Cohere", modality: "text-chat", task_role: "coding",
    quality_tier: "curated-free", priority: "P1-curated-free", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/dots-studio/dots-3-note-preview:free": { family: "Dots Studio", modality: "text-chat", task_role: "general-chat",
    quality_tier: "curated-free", priority: "P1-curated-free", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": { family: "Nemotron/NVIDIA", modality: "text-chat", task_role: "reasoning-general",
    quality_tier: "curated-free", priority: "P1-curated-free", confidence: "low", taxonomy_source: "live-openrouter" },
  "openrouter/nvidia/nemotron-3.5-content-safety:free": { family: "Nemotron/NVIDIA", modality: "moderation-safety", task_role: "safety-classification",
    quality_tier: "specialized", priority: "P-specialized", confidence: "low", taxonomy_source: "live-openrouter" },
};

export function listOpenRouterModelIds(): string[] {
  return Object.keys(OPENROUTER_MODEL_DETAILS);
}
