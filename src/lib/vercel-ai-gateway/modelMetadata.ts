export type AiModelMetadata = {
  family: string;
  modality: string;
  task_role: string;
  quality_tier: string;
  priority: string;
  confidence: string;
  taxonomy_source: "live-omniroute";
};

const MODEL_METADATA: Record<string, AiModelMetadata> = {
  "kilo-gateway/minimax/minimax-m2.5:free": { family: "MiniMax", modality: "text-chat", task_role: "general-chat", quality_tier: "curated-gateway", priority: "P2-curated-gateway", confidence: "low", taxonomy_source: "live-omniroute" },
  "kilo-gateway/nvidia/nemotron-3-super-120b-a12b:free": { family: "Nemotron/NVIDIA", modality: "text-chat", task_role: "general-chat", quality_tier: "curated-gateway", priority: "P2-curated-gateway", confidence: "low", taxonomy_source: "live-omniroute" },
  "kilo-gateway/arcee-ai/trinity-large-preview:free": { family: "Other Open Model", modality: "text-chat", task_role: "general-chat", quality_tier: "curated-gateway", priority: "P2-curated-gateway", confidence: "low", taxonomy_source: "live-omniroute" },
  "kilo-gateway/kilo-auto/free": { family: "Other Open Model", modality: "text-chat", task_role: "general-chat", quality_tier: "curated-gateway", priority: "P2-curated-gateway", confidence: "low", taxonomy_source: "live-omniroute" },
  "groq/qwen/qwen3.8-27b": { family: "Qwen", modality: "text-chat", task_role: "general-reasoning", quality_tier: "frontier-open-weight", priority: "P1-frontier", confidence: "medium", taxonomy_source: "live-omniroute" },
  "groq/openai/gpt-oss-120b": { family: "GPT-OSS", modality: "text-chat", task_role: "general-reasoning", quality_tier: "frontier-open-weight", priority: "P1-frontier", confidence: "medium", taxonomy_source: "live-omniroute" },
  "groq/meta-llama/llama-prompt-guard-2-86m": { family: "Llama Guard", modality: "text-chat", task_role: "safety-classifier", quality_tier: "specialized-guard", priority: "P-specialized", confidence: "medium", taxonomy_source: "live-omniroute" },
  "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free": { family: "Nemotron", modality: "text-chat", task_role: "general-chat", quality_tier: "aggregated-free", priority: "P3-aggregated", confidence: "low", taxonomy_source: "live-omniroute" },
  "openrouter/poolside/laguna-xs-2.1:free": { family: "Laguna", modality: "text-chat", task_role: "code-chat", quality_tier: "aggregated-free", priority: "P3-aggregated", confidence: "low", taxonomy_source: "live-omniroute" },
  "openrouter/inclusionai/ling-3.0-flash-fin:free": { family: "Ling", modality: "text-chat", task_role: "finance-chat", quality_tier: "aggregated-free", priority: "P3-aggregated", confidence: "low", taxonomy_source: "live-omniroute" },
  "openrouter/nvidia/nemotron-3.5-content-safety:free": { family: "Nemotron Safety", modality: "text-chat", task_role: "safety-classifier", quality_tier: "aggregated-free", priority: "P3-aggregated", confidence: "low", taxonomy_source: "live-omniroute" },
  "inception/mercury-2.5": { family: "Mercury", modality: "text-chat", task_role: "general-reasoning", quality_tier: "frontier-diffusion", priority: "P1-frontier", confidence: "medium", taxonomy_source: "live-omniroute" },
  "inception/mercury-2": { family: "Mercury", modality: "text-chat", task_role: "general-reasoning", quality_tier: "frontier-diffusion", priority: "P1-frontier", confidence: "medium", taxonomy_source: "live-omniroute" },
};

export function getAiModelMetadata(id: string, provider: string): AiModelMetadata {
  return MODEL_METADATA[id] ?? {
    family: "Unknown",
    modality: "unknown",
    task_role: "unknown",
    quality_tier: "unclassified",
    priority: "P4-broad-community",
    confidence: "low",
    taxonomy_source: "live-omniroute",
  };
};

export function listAiModelIds(provider?: string): string[] {
  return Object.keys(MODEL_METADATA).filter((id) => !provider || id.startsWith(`${provider}/`));
}
