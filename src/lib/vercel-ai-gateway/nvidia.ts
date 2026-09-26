export const NVIDIA_PROVIDER_ID = "nvidia";
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_CHAT_PATH = "chat/completions";

// NVIDIA's API catalog runs a free trial tier on a keyless-signup account: every model
// is reachable with no card and no purchased credits, and access is throttled per model
// rather than blocked by an account balance. Confirmed live on a fresh key.
//
// The list is deliberately not the /v1/models catalog. That endpoint advertises 82 ids
// but 55 of them return 404 on /v1/chat/completions, because the catalog covers hosted
// NIM deployments that are not part of the shared trial pool. Only ids that returned a
// real completion are registered here, so routing to any of them cannot 404 by
// construction. The build.nvidia.com/models.md catalog is broader still, spanning image,
// video, speech, and scientific models that have no chat/completions route at all.
//
// Ordered strongest-first. Nemotron 3 Ultra is the flagship and leads because it also
// runs the model OpenRouter currently serves, which makes it a strictly better source
// for that route. Lightning trails Super despite the name: it is the least reliable id
// in the set and intermittently held requests until they timed out.
export const NVIDIA_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3-super-120b-a12b",
  "google/gemma-4-31b-it",
  "openai/gpt-oss-20b",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "meta/muse-glimmer-30b",
];

// The trial throttles on requests per model per rolling minute and publishes nothing:
// no rate-limit headers of any kind (only nvcf-reqid and nvcf-status ride along on the
// response), no quota endpoint, and no per-model limits in the docs. Measured instead,
// by draining one model and immediately re-filling from a different one: a second model
// served its own full budget straight after, so the ceiling is per model rather than
// shared across the key. Enforced slightly under the observed ceiling because the
// burst measurements landed between 15 and 20 successes depending on window position.
export const NVIDIA_REQUESTS_PER_MINUTE = 15;

export function nvidiaApiKey(): string {
  return firstEnv("OMNIROUTE_NVIDIA_API_KEY", "NVIDIA_API_KEY", "NVIDIA_API_CATALOG_KEY", "NGC_API_KEY");
}

export function nvidiaBaseUrl(): string {
  return (firstEnv("OMNIROUTE_NVIDIA_BASE_URL", "NVIDIA_BASE_URL", "NVIDIA_API_BASE") || NVIDIA_BASE_URL).replace(/\/+$/, "");
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}
