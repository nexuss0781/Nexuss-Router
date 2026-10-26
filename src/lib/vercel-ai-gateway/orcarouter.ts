export const ORCAROUTER_PROVIDER_ID = "orcarouter";
export const ORCAROUTER_BASE_URL = "https://api.orcarouter.ai/v1";

// The six current free-package model aliases reported by OrcaRouter's public
// catalog. Keep the optional `orcarouter/free` pool router separate from these
// direct model IDs so each listed model remains individually addressable.
export const ORCAROUTER_MODELS = [
  "deepseek/deepseek-v4-flash-free",
  "deepseek/deepseek-v4.1-flash-free",
  "orca/orcaverify-text1.0-free",
  "tencent/hy3-free",
  "tencent/hy4-preview-free",
  "z-ai/glm-5.3-flash-free",
];
