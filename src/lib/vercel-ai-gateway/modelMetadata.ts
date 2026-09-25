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
