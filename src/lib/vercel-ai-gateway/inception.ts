export const INCEPTION_PROVIDER_ID = "inception";
export const INCEPTION_BASE_URL = "https://api.inceptionlabs.ai/v1";
export const INCEPTION_CHAT_PATH = "chat/completions";

export const INCEPTION_MODELS = ["mercury-2.5", "mercury-2"];

// Diffusion decoding converges over a variable number of denoising passes, and every
// pass is billed as a completion token. Measured on mercury-2.5: content comes back
// null with finish_reason "length" at max_tokens 16/32/64/128/256 and only lands from
// ~320 upward, with the exact threshold drifting per request. Reasoning accounts for
// 92-98% of completion tokens and the reasoning field is returned as null, so a small
// budget is spent almost entirely on passes that never reach the client. The floor is
// a ceiling, so an unused budget costs nothing.
export const INCEPTION_TOKEN_FLOOR: Record<string, number> = {
  "mercury-2.5": 1024,
  "mercury-2": 1024,
};

// Models whose documented budget parameter is max_completion_tokens rather than
// max_tokens. Inception returns OpenRouter-style OpenAI params, but the two are not
// interchangeable here.
export const INCEPTION_MAX_COMPLETION_MODELS = new Set(Object.keys(INCEPTION_TOKEN_FLOOR));

export function inceptionApiKey(): string {
  return firstEnv("OMNIROUTE_INCEPTION_API_KEY", "INCEPTION_API_KEY", "MERCURY_API_KEY");
}

export function inceptionBaseUrl(): string {
  return (firstEnv("OMNIROUTE_INCEPTION_BASE_URL", "INCEPTION_BASE_URL") || INCEPTION_BASE_URL).replace(/\/+$/, "");
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}
