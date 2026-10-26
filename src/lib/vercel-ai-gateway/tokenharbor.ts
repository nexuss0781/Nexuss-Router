export const TOKENHARBOR_PROVIDER_ID = "tokenharbor";
export const TOKENHARBOR_BASE_URL = "https://tokenharbor.ai/v1";

// These four chat model IDs were confirmed in TokenHarbor's catalog with zero
// input and output prices, and the OpenAI-compatible chat-completions endpoint
// was verified. Keep the registered set curated rather than exposing every
// catalog entry without a serving check.
export const TOKENHARBOR_MODELS = [
  "deepseek-v4.1-flash:free",
  "deepseek-v4-flash:free",
  "mimo-v2.6-flash:free",
  "mimo-v2.5:free",
];
