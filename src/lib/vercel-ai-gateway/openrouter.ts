export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_PATH = "chat/completions";

// Only models confirmed to have at least one live serving endpoint at the last
// catalog sweep. The four remaining audit targets resolved to zero endpoints and
// are deliberately absent: routing to them can only ever return an upstream error.
export const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "poolside/laguna-xs-2.1:free",
  "inclusionai/ling-3.0-flash-fin:free",
  "nvidia/nemotron-3.5-content-safety:free",
];

export function openRouterApiKey(): string {
  return (process.env.OMNIROUTE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "").trim();
}

export function openRouterBaseUrl(): string {
  return (process.env.OMNIROUTE_OPENROUTER_BASE_URL || OPENROUTER_BASE_URL).replace(/\/+$/, "");
}
