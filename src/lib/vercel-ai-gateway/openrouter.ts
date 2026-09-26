export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_PATH = "chat/completions";

// Only models confirmed to have at least one live serving endpoint at the last
// catalog sweep. The four remaining audit targets resolved to zero endpoints and
// are deliberately absent: routing to them can only ever return an upstream error.
//
// Three previously-served models were withdrawn after live production testing:
//   poolside/laguna-xs-2.1:free            Poolside rejects the gateway credentials
//                                          outright (provider_authentication_failed),
//                                          so the route can never succeed.
//   inclusionai/ling-3.0-flash-fin:free     Reasoning models that spend the entire
//   nvidia/nemotron-3.5-content-safety:free requested budget on reasoning_tokens and
//                                          answer with content: null, which reaches
//                                          the caller as a 200 carrying nothing.
// Neither failure mode is fixable from NAR's side, so the routes are removed rather
// than left to fail in production. The audit record in openrouterCatalog.ts is
// intentionally retained.
export const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

export function openRouterApiKey(): string {
  return (process.env.OMNIROUTE_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || "").trim();
}

export function openRouterBaseUrl(): string {
  return (process.env.OMNIROUTE_OPENROUTER_BASE_URL || OPENROUTER_BASE_URL).replace(/\/+$/, "");
}
