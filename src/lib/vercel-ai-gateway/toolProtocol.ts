import { createHash, randomUUID } from "node:crypto";

export const OMNIROUTE_TOOL_PROTOCOL = "openai-chat/v1";
export const OMNIROUTE_TOOL_PROTOCOL_MARKER = "OmniRoute tool protocol v1";
export const OMNIROUTE_TOOL_AFFINITY_HEADER = "x-omniroute-tool-affinity";

export type ToolAffinity = {
  providerId: string;
  model: string;
};

type JsonRecord = Record<string, any>;

export type NormalizedToolRequest = {
  body: JsonRecord;
  hasTools: boolean;
  hasToolResult: boolean;
  hasToolIntent: boolean;
  invalidToolDefinition: boolean;
  affinity: ToolAffinity | null;
};

const DEFAULT_TOOL_PROTOCOL_PROMPT = [
  "[OmniRoute tool protocol v1]",
  "You may call only the tools provided in this request.",
  "When a tool is needed, use the structured assistant tool-call channel with this shape: {\"id\":\"call_<unique>\",\"type\":\"function\",\"function\":{\"name\":\"<tool>\",\"arguments\":\"<JSON object string>\"}}.",
  "If native structured tool calls are unavailable, emit only this JSON object in content: {\"omniroute_tool_call\":{\"name\":\"<tool>\",\"arguments\":{...}}}; do not add prose.",
  "Keep arguments valid JSON that matches the declared schema and never invent a tool name.",
  "After a role:\"tool\" result arrives, match it by tool_call_id and continue the task; do not repeat a completed call unless its result requires another call.",
].join("\n");

const AFFINITY_PREFIX = "call_omni_";
const AFFINITY_VERSION = "omni1";
const MAX_AFFINITY_PAYLOAD_LENGTH = 2048;

type ToolChoiceResult = {
  value?: unknown;
  valid: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asJsonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(asJsonText).filter(Boolean).join("\n");
  if (isRecord(value) && typeof value.text === "string") return value.text;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function completeArguments(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "{}";
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return "{}";
    }
  }
  if (value === undefined || value === null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function streamArguments(value: unknown): string {
  if (typeof value === "string") return value;
  return completeArguments(value);
}

function parameterObject(value: unknown): JsonRecord {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      return { type: "object", properties: {} };
    }
  }
  return { type: "object", properties: {} };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function encodeToolAffinity(affinity: ToolAffinity): string {
  const payload = Buffer.from(JSON.stringify([affinity.providerId, affinity.model]), "utf8").toString("base64url");
  return `${AFFINITY_VERSION}.${payload}`;
}

export function decodeToolAffinity(value: unknown): ToolAffinity | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let token = value.trim();
  if (token.startsWith(AFFINITY_PREFIX)) token = token.slice(AFFINITY_PREFIX.length);
  if (!token.startsWith(`${AFFINITY_VERSION}.`)) return null;
  const payload = token.slice(AFFINITY_VERSION.length + 1).split(".")[0];
  if (!payload || payload.length > MAX_AFFINITY_PAYLOAD_LENGTH) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== "string" || typeof decoded[1] !== "string") return null;
    if (!decoded[0] || !decoded[1] || decoded[0].length > 512 || decoded[1].length > 1024) return null;
    return { providerId: decoded[0], model: decoded[1] };
  } catch {
    return null;
  }
}

function withAffinity(id: string, affinity?: ToolAffinity | null): string {
  if (!affinity) return id;
  const existing = decodeToolAffinity(id);
  if (existing?.providerId === affinity.providerId && existing.model === affinity.model) return id;
  const token = encodeToolAffinity(affinity);
  const digest = hash(`${token}|${id}`).slice(0, 16);
  return `${AFFINITY_PREFIX}${token}.${digest}`;
}

function callId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeFunction(value: unknown): JsonRecord | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.function) ? value.function : value;
  const name = typeof source.name === "string" ? source.name : typeof value.name === "string" ? value.name : "";
  if (!name.trim()) return null;
  const result: JsonRecord = {
    name: name.trim(),
    ...(typeof source.description === "string" ? { description: source.description } : {}),
    parameters: parameterObject(source.parameters ?? source.input_schema ?? source.inputSchema),
  };
  if (source.strict !== undefined) result.strict = source.strict;
  return result;
}

function normalizeTool(value: unknown): JsonRecord | null {
  const fn = normalizeFunction(value);
  if (!fn) return null;
  const result: JsonRecord = { type: "function", function: fn };
  if (isRecord(value) && value.strict !== undefined) result.strict = value.strict;
  return result;
}

function normalizeToolChoice(value: unknown): ToolChoiceResult {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value === "string") {
    if (value === "any") return { value: "required", valid: true };
    if (["auto", "none", "required"].includes(value)) return { value, valid: true };
    return { valid: false };
  }
  if (!isRecord(value)) return { valid: false };
  if (value.type === "function") {
    const fn = isRecord(value.function) ? value.function : value;
    const name = typeof fn.name === "string" ? fn.name : typeof value.function_name === "string" ? value.function_name : "";
    if (!name.trim()) return { valid: false };
    return { value: { type: "function", function: { name: name.trim() } }, valid: true };
  }
  if (value.type === "tool" && typeof value.name === "string" && value.name.trim()) {
    return { value: { type: "function", function: { name: value.name.trim() } }, valid: true };
  }
  if (["auto", "none", "required", "any"].includes(value.type)) {
    return { value: value.type === "any" ? "required" : value.type, valid: true };
  }
  if (typeof value.name === "string" && value.name.trim()) {
    return { value: { type: "function", function: { name: value.name.trim() } }, valid: true };
  }
  return { valid: false };
}

function normalizeToolCall(value: unknown, affinity: ToolAffinity | null | undefined, complete: boolean): JsonRecord | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.function) ? value.function : value;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) return null;
  const rawArguments = source.arguments ?? source.input ?? source.args;
  const result: JsonRecord = {
    ...value,
    type: "function",
    function: {
      ...(isRecord(value.function) ? value.function : {}),
      name,
      arguments: complete ? completeArguments(rawArguments) : streamArguments(rawArguments),
    },
  };
  if (value.input !== undefined) delete result.input;
  if (value.args !== undefined) delete result.args;
  const generatedId = `call_${randomUUID().replace(/-/g, "")}`;
  const suppliedId = value.id ?? value.tool_call_id;
  if (complete) result.id = withAffinity(callId(suppliedId, generatedId), affinity);
  else if (suppliedId !== undefined) result.id = withAffinity(String(suppliedId), affinity);
  return result;
}

function normalizeToolResultContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((part) => isRecord(part) && typeof part.text === "string" ? part.text : asJsonText(part)).filter(Boolean).join("\n");
  }
  if (isRecord(value) && typeof value.text === "string") return value.text;
  return asJsonText(value);
}

function normalizeMessages(messages: unknown[]): JsonRecord[] {
  const result: JsonRecord[] = [];
  for (const raw of messages) {
    if (!isRecord(raw)) {
      result.push(raw as JsonRecord);
      continue;
    }
    const role = typeof raw.role === "string" ? raw.role : "";
    if (role === "user" && Array.isArray(raw.content)) {
      const toolResults = raw.content.filter((part) => isRecord(part) && part.type === "tool_result");
      if (toolResults.length) {
        const remaining = raw.content.filter((part) => !(isRecord(part) && part.type === "tool_result"));
        if (remaining.length) result.push({ ...raw, content: remaining.length === 1 ? remaining[0] : remaining });
        for (const part of toolResults) {
          const block = part as JsonRecord;
          result.push({
            role: "tool",
            tool_call_id: typeof block.tool_use_id === "string" ? block.tool_use_id : typeof block.tool_call_id === "string" ? block.tool_call_id : "",
            content: normalizeToolResultContent(block.content),
          });
        }
        continue;
      }
    }
    const message: JsonRecord = { ...raw };
    if (role === "developer") message.role = "system";
    if (message.role === "assistant") {
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls.map((call) => normalizeToolCall(call, undefined, true)).filter((call): call is JsonRecord => Boolean(call)) : [];
      const legacyCall = isRecord(message.function_call) ? normalizeToolCall({ function: message.function_call, id: message.tool_call_id }, undefined, true) : null;
      if (!calls.length && legacyCall) calls.push(legacyCall);
      if (calls.length) {
        message.tool_calls = calls;
        delete message.function_call;
        if (message.content === undefined) message.content = null;
      }
      if (Array.isArray(message.content)) {
        const text = message.content.filter((part) => isRecord(part) && (part.type === "text" || part.type === "output_text") && typeof part.text === "string").map((part) => part.text).join("");
        const toolUses = message.content.filter((part) => isRecord(part) && part.type === "tool_use");
        if (toolUses.length) {
          const contentCalls = toolUses.map((part) => normalizeToolCall({ id: (part as JsonRecord).id, type: "function", function: { name: (part as JsonRecord).name, arguments: (part as JsonRecord).input } }, undefined, true)).filter((call): call is JsonRecord => Boolean(call));
          message.tool_calls = [...calls, ...contentCalls];
          message.content = text || null;
          delete message.function_call;
        }
      }
    }
    if (message.role === "tool" || role === "function") {
      message.content = normalizeToolResultContent(message.content);
      if (message.role === "function") message.role = "tool";
    }
    result.push(message);
  }
  return result;
}

function hasToolResult(messages: JsonRecord[]): boolean {
  return messages.some((message) => message.role === "tool" || message.role === "function" || (Array.isArray(message.content) && message.content.some((part) => isRecord(part) && part.type === "tool_result")));
}

function hasProtocolMarker(messages: JsonRecord[]): boolean {
  return messages.some((message) => (message.role === "system" || message.role === "developer") && asJsonText(message.content).includes(OMNIROUTE_TOOL_PROTOCOL_MARKER));
}

function toolPrompt(): string {
  const configured = process.env.OMNIROUTE_TOOL_PROTOCOL_PROMPT?.trim();
  return configured ? `${OMNIROUTE_TOOL_PROTOCOL_MARKER}\n${configured}`.slice(0, 4_000) : DEFAULT_TOOL_PROTOCOL_PROMPT;
}

function normalizeToolSource(body: JsonRecord): { tools: JsonRecord[]; invalid: boolean; hadSource: boolean } {
  const modern = body.tools ?? undefined;
  const legacy = body.functions ?? undefined;
  const source = Array.isArray(modern) && modern.length ? modern : Array.isArray(legacy) ? legacy : modern;
  const hadSource = Array.isArray(source) && source.length > 0;
  if (source !== undefined && !Array.isArray(source)) return { tools: [], invalid: true, hadSource: true };
  const tools = (Array.isArray(source) ? source : []).map((tool) => normalizeTool(tool)).filter((tool): tool is JsonRecord => Boolean(tool));
  return { tools, invalid: hadSource && tools.length !== source.length, hadSource };
}

export function normalizeChatToolRequest(input: unknown, options: { injectPrompt?: boolean } = {}): NormalizedToolRequest {
  const body = isRecord(input) ? { ...input } : {};
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = normalizeMessages(rawMessages);
  const source = normalizeToolSource(body);
  const choice = normalizeToolChoice(body.tool_choice ?? body.function_call);
  const hasTools = source.tools.length > 0;
  const hasResult = hasToolResult(messages);
  const hasIntent = hasResult || (hasTools && choice.value !== "none");
  const invalidToolDefinition = source.invalid || !choice.valid || (choice.value === "required" && !hasTools);
  const normalized: JsonRecord = { ...body, messages };
  delete normalized.routing_class;
  delete normalized.omniroute_tool_affinity;
  delete normalized.tool_affinity;
  delete normalized.functions;
  delete normalized.function_call;
  if (hasTools) normalized.tools = source.tools;
  else delete normalized.tools;
  if (choice.value !== undefined) normalized.tool_choice = choice.value;
  else delete normalized.tool_choice;
  if (hasIntent && options.injectPrompt !== false && !hasProtocolMarker(messages)) {
    normalized.messages = [{ role: "system", content: toolPrompt() }, ...messages];
  }
  return {
    body: normalized,
    hasTools,
    hasToolResult: hasResult,
    hasToolIntent: hasIntent,
    invalidToolDefinition,
    affinity: extractToolAffinity(messages),
  };
}

const TOOL_ARGUMENT_KEYS = ["arguments", "parameters", "input", "args"] as const;

function closeTruncatedJson(fragment: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of fragment) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if ((char === "}" || char === "]") && stack.length) stack.pop();
  }
  let closed = escaped || inString ? fragment + '"' : fragment;
  closed = closed.replace(/,\s*$/, "");
  for (let index = stack.length - 1; index >= 0; index--) closed += stack[index] === "{" ? "}" : "]";
  return closed;
}

function findToolCallObject(value: unknown, depth = 0): JsonRecord | null {
  if (depth > 4) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findToolCallObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const envelope = value.omniroute_tool_call ?? value.tool_call ?? (Array.isArray(value.tool_calls) ? value.tool_calls[0] : undefined);
  if (envelope !== undefined) {
    const unwrapped = isRecord(envelope) && isRecord(envelope.function) ? envelope.function : isRecord(envelope) ? envelope : null;
    if (unwrapped && typeof unwrapped.name === "string" && unwrapped.name.trim()) return unwrapped;
  }
  if (value.type === "function" && isRecord(value.function) && typeof value.function.name === "string" && value.function.name.trim()) return value.function;
  if (typeof value.name === "string" && value.name.trim() && TOOL_ARGUMENT_KEYS.some((key) => value[key] !== undefined)) return value;
  return null;
}

function parseTextToolCall(value: unknown): JsonRecord | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  const firstBrace = trimmed.indexOf("{");
  const candidates = firstBrace > 0 ? [trimmed, trimmed.slice(firstBrace)] : [trimmed];
  for (const candidate of candidates) {
    for (const text of [candidate, closeTruncatedJson(candidate)]) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }
      const source = findToolCallObject(parsed);
      if (!source) continue;
      const args = TOOL_ARGUMENT_KEYS.map((key) => source[key]).find((candidateArgs) => candidateArgs !== undefined);
      return {
        id: isRecord(source) && typeof source.id === "string" ? source.id : undefined,
        type: "function",
        function: { name: String(source.name).trim(), arguments: args ?? {} },
      };
    }
  }
  return null;
}

function normalizeResponseMessage(message: JsonRecord, affinity: ToolAffinity | null): JsonRecord {
  const result: JsonRecord = { ...message };
  let calls = Array.isArray(result.tool_calls) ? result.tool_calls.map((call) => normalizeToolCall(call, affinity, true)).filter((call): call is JsonRecord => Boolean(call)) : [];
  const legacyCall = isRecord(result.function_call) ? normalizeToolCall({ function: result.function_call, id: result.tool_call_id }, affinity, true) : null;
  if (!calls.length && legacyCall) calls.push(legacyCall);
  if (!calls.length && typeof result.content === "string") {
    const textCall = parseTextToolCall(result.content);
    if (textCall) {
      calls.push(normalizeToolCall(textCall, affinity, true) as JsonRecord);
      result.content = null;
    }
  }
  if (Array.isArray(result.content)) {
    const text = result.content.filter((part) => isRecord(part) && (part.type === "text" || part.type === "output_text") && typeof part.text === "string").map((part) => part.text).join("");
    const toolUses = result.content.filter((part) => isRecord(part) && part.type === "tool_use");
    if (toolUses.length) {
      calls.push(...toolUses.map((part) => normalizeToolCall({ id: (part as JsonRecord).id, type: "function", function: { name: (part as JsonRecord).name, arguments: (part as JsonRecord).input } }, affinity, true)).filter((call): call is JsonRecord => Boolean(call)));
      result.content = text || null;
    }
  }
  if (calls.length) {
    result.tool_calls = calls;
    result.content = result.content ?? null;
    delete result.function_call;
  }
  return result;
}

export function normalizeChatToolResponse(input: unknown, affinity?: ToolAffinity | null): JsonRecord {
  if (!isRecord(input) || !Array.isArray(input.choices)) return isRecord(input) ? input : {};
  const choices = input.choices.map((choice) => {
    if (!isRecord(choice)) return choice;
    const result: JsonRecord = { ...choice };
    if (isRecord(choice.message)) result.message = normalizeResponseMessage(choice.message, affinity || null);
    if (isRecord(result.message) && Array.isArray(result.message.tool_calls) && result.message.tool_calls.length && (result.finish_reason === undefined || result.finish_reason === null || result.finish_reason === "stop")) result.finish_reason = "tool_calls";
    return result;
  });
  return { ...input, choices };
}

function normalizeStreamChoice(choice: unknown, affinity: ToolAffinity): unknown {
  if (!isRecord(choice)) return choice;
  const result: JsonRecord = { ...choice };
  if (isRecord(choice.delta)) {
    const delta: JsonRecord = { ...choice.delta };
    let calls = Array.isArray(delta.tool_calls) ? delta.tool_calls.map((call) => normalizeToolCall(call, affinity, false)).filter((call): call is JsonRecord => Boolean(call)) : [];
    const legacy = isRecord(delta.function_call) ? normalizeToolCall({ function: delta.function_call, id: delta.id }, affinity, false) : null;
    if (!calls.length && legacy) calls.push(legacy);
    if (calls.length) delta.tool_calls = calls;
    if (delta.function_call !== undefined) delete delta.function_call;
    result.delta = delta;
  }
  if (isRecord(choice.message)) result.message = normalizeResponseMessage(choice.message, affinity);
  return result;
}

function normalizeStreamPayload(payload: JsonRecord, affinity: ToolAffinity): JsonRecord {
  if (!Array.isArray(payload.choices)) return payload;
  return { ...payload, choices: payload.choices.map((choice) => normalizeStreamChoice(choice, affinity)) };
}

function transformSseLine(line: string, affinity: ToolAffinity): string {
  if (!line.startsWith("data:")) return line;
  const data = line.slice(5).trimStart();
  if (!data || data === "[DONE]") return line;
  try {
    const payload = JSON.parse(data);
    if (!isRecord(payload)) return line;
    return `data: ${JSON.stringify(normalizeStreamPayload(payload, affinity))}`;
  } catch {
    return line;
  }
}

export function canonicalizeToolCallStream(body: ReadableStream<Uint8Array> | null, affinity: ToolAffinity): ReadableStream<Uint8Array> | null {
  if (!body) return null;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) {
            buffer += decoder.decode();
            if (buffer) controller.enqueue(encoder.encode(buffer.split("\n").map((line) => transformSseLine(line, affinity)).join("\n")));
            controller.close();
            return;
          }
          buffer += decoder.decode(next.value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          if (lines.length) {
            controller.enqueue(encoder.encode(lines.map((line) => transformSseLine(line, affinity)).join("\n") + "\n"));
            return;
          }
        }
      } catch {
        try { await reader.cancel(); } catch { }
        controller.close();
      }
    },
    cancel(reason) { void reader.cancel(reason).catch(() => undefined); },
  });
}

export function extractToolAffinity(messages: unknown[]): ToolAffinity | null {
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const direct = message.omniroute_tool_affinity ?? message.tool_affinity;
    const directAffinity = decodeToolAffinity(direct);
    if (directAffinity) return directAffinity;
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const call of calls) {
      if (isRecord(call)) {
        const callAffinity = decodeToolAffinity(call.id);
        if (callAffinity) return callAffinity;
      }
    }
    const messageAffinity = decodeToolAffinity(message.tool_call_id);
    if (messageAffinity) return messageAffinity;
  }
  return null;
}
