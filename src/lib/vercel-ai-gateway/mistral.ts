export const MISTRAL_PROVIDER_ID = "mistral";
export const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";
export const MISTRAL_CHAT_PATH = "chat/completions";

// Free-mode models reachable on a phone-verified key with no payment method. Mistral
// enforces rate limits per model, and the flagship tiers report
// x-ratelimit-limit-req-minute: 0 in free mode, so the Ministral edge family plus
// Codestral are the only serving routes. Ordered best-general-first: 8B is the
// strongest general chat model with healthy headroom, 14B is stronger but capped at
// 30 req/min, and Codestral is code-specialised so it trails.
export const MISTRAL_MODELS = [
  "ministral-8b-latest",
  "ministral-3b-latest",
  "ministral-14b-latest",
  "codestral-latest",
];

export function mistralApiKey(): string {
  return firstEnv("OMNIROUTE_MISTRAL_API_KEY", "MISTRAL_API_KEY");
}

export function mistralBaseUrl(): string {
  return (firstEnv("OMNIROUTE_MISTRAL_BASE_URL", "MISTRAL_BASE_URL") || MISTRAL_BASE_URL).replace(/\/+$/, "");
}

// Mistral accepts max_completion_tokens without error and then ignores it entirely,
// falling back to the model default output budget. An OpenAI-style client asking for a
// small cap would therefore get an unbounded completion, so the intent is translated
// to the parameter Mistral actually honours. max_tokens wins when both are present.
export function normalizeMistralParams(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.max_tokens === "number") return body;
  const requested = body.max_completion_tokens;
  if (typeof requested !== "number") return body;
  const { max_completion_tokens: _dropped, ...rest } = body;
  return { ...rest, max_tokens: requested };
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}
