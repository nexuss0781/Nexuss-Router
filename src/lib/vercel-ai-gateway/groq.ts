export const GROQ_PROVIDER_ID = "groq";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_CHAT_PATH = "chat/completions";
export const GROQ_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
export const GROQ_GUARD_MODEL = "meta-llama/llama-prompt-guard-2-86m";
export const GROQ_GUARD_MAX_INPUT_CHARS = 1200;
export const GROQ_GUARD_DEFAULT_THRESHOLD = 0.5;
export const GROQ_GUARD_TIMEOUT_MS = 10_000;

const NATIVE_TOOL_PROVIDER_PREFIXES = [GROQ_PROVIDER_ID];

export function supportsNativeToolCalls(model: string): boolean {
  const head = model.split("/", 1)[0];
  return NATIVE_TOOL_PROVIDER_PREFIXES.includes(head);
}

export const GROQ_REASONING_TOKEN_FLOOR: Record<string, number> = {
  "openai/gpt-oss-120b": 1024,
};

export function minMaxTokensFor(model: string): number {
  const override = Number.parseInt(firstEnv("OMNIROUTE_GROQ_MIN_MAX_TOKENS"), 10);
  if (Number.isFinite(override) && override > 0) return override;
  return GROQ_REASONING_TOKEN_FLOOR[model] ?? 0;
}

export function withMaxTokensFloor(body: Record<string, unknown>, model: string): { body: Record<string, unknown>; applied: number } {
  const floor = minMaxTokensFor(model);
  if (!floor) return { body, applied: 0 };
  const requested = typeof body.max_tokens === "number"
    ? body.max_tokens
    : typeof body.max_completion_tokens === "number"
      ? body.max_completion_tokens
      : 0;
  if (requested >= floor) return { body, applied: 0 };
  return { body: { ...body, max_tokens: floor, max_completion_tokens: undefined }, applied: floor };
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function groqApiKey(): string {
  return firstEnv("OMNIROUTE_GROQ_API_KEY", "GROQ_API_KEY", "GROQ_GATEWAY_API_KEY");
}

export function groqBaseUrl(): string {
  return (firstEnv("OMNIROUTE_GROQ_BASE_URL", "GROQ_API_BASE", "GROQ_BASE_URL") || GROQ_BASE_URL).replace(/\/+$/, "");
}

export function promptGuardEnabled(): boolean {
  return firstEnv("OMNIROUTE_PROMPT_GUARD", "PROMPT_GUARD").toLowerCase() === "on";
}

export function promptGuardThreshold(): number {
  const raw = firstEnv("OMNIROUTE_PROMPT_GUARD_THRESHOLD", "PROMPT_GUARD_THRESHOLD");
  if (!raw) return GROQ_GUARD_DEFAULT_THRESHOLD;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : GROQ_GUARD_DEFAULT_THRESHOLD;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") {
        const record = part as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

export function latestUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as Record<string, unknown> | undefined;
    if (!message || message.role !== "user") continue;
    const text = messageText(message.content).trim();
    if (text) return text;
  }
  return "";
}

export type PromptScreenResult = { blocked: boolean; score: number; reason: string };

function parseGuardScore(payload: any): number {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "number") return content;
  if (typeof content !== "string") return Number.NaN;
  const match = content.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  return match ? Number.parseFloat(match[0]) : Number.NaN;
}

export async function screenPrompt(text: string, dependencies: { fetchImpl?: typeof fetch } = {}): Promise<PromptScreenResult> {
  const apiKey = groqApiKey();
  const trimmed = text.trim();
  if (!apiKey || !trimmed) return { blocked: false, score: 0, reason: "skipped" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_GUARD_TIMEOUT_MS);
  const doFetch = dependencies.fetchImpl ?? fetch;
  try {
    const upstream = await doFetch(`${groqBaseUrl()}/${GROQ_CHAT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_GUARD_MODEL,
        messages: [{ role: "user", content: trimmed.slice(0, GROQ_GUARD_MAX_INPUT_CHARS) }],
        max_tokens: 16,
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) return { blocked: false, score: 0, reason: `guard_http_${upstream.status}` };
    const score = parseGuardScore(await upstream.json().catch(() => null));
    if (!Number.isFinite(score)) return { blocked: false, score: 0, reason: "guard_unparseable" };
    const threshold = promptGuardThreshold();
    return { blocked: score >= threshold, score, reason: score >= threshold ? "guard_threshold" : "guard_clear" };
  } catch {
    return { blocked: false, score: 0, reason: "guard_unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
