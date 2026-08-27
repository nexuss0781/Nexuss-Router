import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = (process.env.OMNIROUTE_GATEWAY_URL || "").replace(/\/+$/, "");
const gatewayKey = process.env.OMNIROUTE_GATEWAY_KEY || "";
const minimumIntervalMs = 65_000;
const requestTimeoutMs = 120_000;
const outputDirectory = "artifacts";

if (!baseUrl || !gatewayKey) {
  throw new Error("OMNIROUTE_GATEWAY_URL and OMNIROUTE_GATEWAY_KEY must be provided as protected workflow secrets.");
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function completionQuality(content) {
  if (typeof content !== "string" || !content.trim()) return { readable: false, score: 0 };
  const normalized = content.trim();
  const lines = normalized.split(/\r?\n/).filter(Boolean);
  return {
    readable: true,
    score:
      Number(/^sum\s*=\s*12$/im.test(normalized)) +
      Number(/^opposite\s*=\s*up$/im.test(normalized)) +
      Number(/^tag\s*=\s*AF1$/im.test(normalized)) +
      Number(lines.length === 3),
  };
}

function safeError(payload) {
  if (typeof payload?.error === "string") return payload.error.slice(0, 240);
  if (typeof payload?.error?.message === "string") return payload.error.message.slice(0, 240);
  return null;
}

const headers = {
  authorization: `Bearer ${gatewayKey}`,
  "content-type": "application/json",
};
const catalogResponse = await fetch(`${baseUrl}/models`, { headers: { authorization: headers.authorization } });
const catalog = await catalogResponse.json().catch(() => ({}));
if (!catalogResponse.ok || !Array.isArray(catalog?.data)) {
  throw new Error(`Could not retrieve the protected gateway model catalog (HTTP ${catalogResponse.status}).`);
}

const allAirforceModels = catalog.data
  .filter((model) => typeof model?.id === "string" && model.id.startsWith("airforce/"))
  .map((model) => ({ id: model.id, modality: model.modality || "unknown", taskRole: model.task_role || "unknown" }))
  .sort((left, right) => left.id.localeCompare(right.id));
const audioModels = allAirforceModels.filter((model) => model.modality === "audio-generation");
const textModels = allAirforceModels.filter((model) => model.modality !== "audio-generation");
const prompt = "Reply in exactly three lines and use only these lines:\nsum=12\nopposite=up\ntag=AF1";

console.log(`Airforce catalog: ${allAirforceModels.length} routes; ${textModels.length} text routes; ${audioModels.length} audio routes.`);

const results = [];
let nextRequestAt = Date.now();
for (const [index, model] of textModels.entries()) {
  const waitMs = Math.max(0, nextRequestAt - Date.now());
  if (waitMs) await sleep(waitMs);
  const startedAt = Date.now();
  nextRequestAt = startedAt + minimumIntervalMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ model: model.id, messages: [{ role: "user", content: prompt }], max_tokens: 256, temperature: 0 }),
    });
    const payload = await response.json().catch(() => ({}));
    const quality = completionQuality(payload?.choices?.[0]?.message?.content);
    const result = {
      model: model.id,
      modality: model.modality,
      taskRole: model.taskRole,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      returnedModel: typeof payload?.model === "string" ? payload.model : null,
      readableCompletion: quality.readable,
      qualityScore: quality.score,
      error: safeError(payload),
    };
    results.push(result);
    console.log(`[${index + 1}/${textModels.length}] ${model.id}: HTTP ${response.status}; readable=${quality.readable}; ${result.latencyMs} ms`);
  } catch (error) {
    const result = {
      model: model.id,
      modality: model.modality,
      taskRole: model.taskRole,
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      returnedModel: null,
      readableCompletion: false,
      qualityScore: 0,
      error: error instanceof Error && error.name === "AbortError" ? "Request timed out" : "Network request failed",
    };
    results.push(result);
    console.log(`[${index + 1}/${textModels.length}] ${model.id}: ${result.error}; ${result.latencyMs} ms`);
  } finally {
    clearTimeout(timeout);
  }
}

const readable = results.filter((result) => result.httpStatus === 200 && result.readableCompletion);
const ranked = [...readable].sort((left, right) => right.qualityScore - left.qualityScore || left.latencyMs - right.latencyMs || left.model.localeCompare(right.model));
const generatedAt = new Date().toISOString();
const summary = { generatedAt, requestIntervalMs: minimumIntervalMs, prompt, allAirforceModels, audioModels, results, ranking: ranked.map((result, index) => ({ rank: index + 1, ...result })) };
const report = [
  "# Airforce Free Text Model Audit",
  "",
  `Completed: ${generatedAt}`,
  "",
  "| Scope | Count |",
  "| --- | ---: |",
  `| Airforce free routes in live OmniRoute catalog | ${allAirforceModels.length} |`,
  `| Text routes tested through chat completions | ${textModels.length} |`,
  `| Audio routes cataloged but not chat-tested | ${audioModels.length} |`,
  `| Readable HTTP 200 text completions | ${readable.length} |`,
  "",
  "Every upstream text request started at least 65 seconds after the prior request start.",
  "",
  "## Ranked readable text responses",
  "",
  "| Rank | Model | Quality | Latency (ms) |",
  "| ---: | --- | ---: | ---: |",
  ...ranked.map((result, index) => `| ${index + 1} | \`${result.model}\` | ${result.qualityScore}/4 | ${result.latencyMs} |`),
  "",
  "## All text-route checks",
  "",
  "| Model | HTTP | Readable | Quality | Latency (ms) | Result |",
  "| --- | ---: | --- | ---: | ---: | --- |",
  ...results.map((result) => `| \`${result.model}\` | ${result.httpStatus ?? "—"} | ${result.readableCompletion ? "Yes" : "No"} | ${result.qualityScore}/4 | ${result.latencyMs} | ${result.error || "Completion returned"} |`),
  "",
  "## Audio routes not sent to chat completions",
  "",
  "| Model | Modality | Task role |",
  "| --- | --- | --- |",
  ...audioModels.map((model) => `| \`${model.id}\` | ${model.modality} | ${model.taskRole} |`),
  "",
].join("\n");
const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const csv = [
  "model,modality,task_role,http_status,latency_ms,returned_model,readable_completion,quality_score,error",
  ...results.map((result) => [result.model, result.modality, result.taskRole, result.httpStatus, result.latencyMs, result.returnedModel, result.readableCompletion, result.qualityScore, result.error].map(escapeCsv).join(",")),
].join("\n");

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(`${outputDirectory}/airforce-free-text-audit.json`, `${JSON.stringify(summary, null, 2)}\n`),
  writeFile(`${outputDirectory}/airforce-free-text-audit.csv`, `${csv}\n`),
  writeFile(`${outputDirectory}/airforce-free-text-audit.md`, `${report}\n`),
]);

console.log(`Audit complete: ${readable.length}/${textModels.length} text routes returned readable HTTP 200 completions.`);
