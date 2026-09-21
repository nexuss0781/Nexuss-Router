import http from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import next from "next";

const PORT = Number(process.env.PORT || 10000);
const VERCEL_URL = (process.env.VERCEL_URL || "https://omniouter-vercel.vercel.app").replace(/\/+$/, "");
const DATA_DIR = process.env.RENDER_DATA_DIR || "/var/data/omniroute";
const STATE_FILE = path.join(DATA_DIR, "state.json");
const POLL_MS = Number(process.env.RENDER_LONG_POLL_MS || 250);
const IDLE_FLUSH_MS = Number(process.env.RENDER_IDLE_FLUSH_MS || 30000);
const REQUEST_TIMEOUT_MS = Number(process.env.RENDER_REQUEST_TIMEOUT_MS || 300000);
const INTERNAL_SECRET = process.env.RENDER_INTERNAL_SECRET || "";

const defaultState = () => ({ version: 1, updatedAt: new Date().toISOString(), lastActivityAt: null, pendingFlush: false, metrics: { requests: 0, local: 0, flushed: 0, errors: 0 }, changes: [] });
let state = defaultState();
let writeChain = Promise.resolve();
let lastActivity = Date.now();
let idleFlushInFlight = false;

async function loadRuntimeConfig() {
  if (!INTERNAL_SECRET) return;
  try {
    const response = await fetch(`${VERCEL_URL}/api/internal/render-config`, {
      headers: { authorization: `Bearer ${INTERNAL_SECRET}`, accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`config_http_${response.status}`);
    const payload = await response.json();
    for (const key of ["OMNIROUTE_AI_API_KEY", "OMNIROUTE_VERCEL_PROFILE", "DATABASE_URL", "PARADOX_PASSPHRASE", "PARADOX_API_KEY"]) {
      if (typeof payload?.values?.[key] === "string" && payload.values[key]) process.env[key] = payload.values[key];
    }
    console.log("runtime config loaded from Vercel");
  } catch (error) {
    console.error(`runtime config unavailable: ${error instanceof Error ? error.message : "unknown_error"}`);
  }
}

async function persist() {
  writeChain = writeChain.then(async () => { const tmp = `${STATE_FILE}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(state, null, 2), "utf8"); await rename(tmp, STATE_FILE); });
  return writeChain;
}
async function loadState() { await mkdir(DATA_DIR, { recursive: true }); try { state = JSON.parse(await readFile(STATE_FILE, "utf8")); } catch { await persist(); } }
function recordChange(kind, data = {}) { state.changes.push({ id: randomUUID(), kind, at: new Date().toISOString(), data }); if (state.changes.length > 100) state.changes.splice(0, state.changes.length - 100); state.version += 1; state.updatedAt = new Date().toISOString(); state.lastActivityAt = state.updatedAt; state.pendingFlush = true; lastActivity = Date.now(); }
async function flushToVercel(reason) {
  if (idleFlushInFlight || !state.pendingFlush) return;
  idleFlushInFlight = true;
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${VERCEL_URL}/api/internal/render-sync`, { method: "POST", headers: { "content-type": "application/json", ...(INTERNAL_SECRET ? { authorization: `Bearer ${INTERNAL_SECRET}` } : {}) }, body: JSON.stringify({ source: "render", reason, state: { version: state.version, updatedAt: state.updatedAt, lastActivityAt: state.lastActivityAt, metrics: state.metrics, changes: state.changes } }), signal: controller.signal }).finally(() => clearTimeout(timer));
    if (response.ok) { state.pendingFlush = false; state.metrics.flushed += 1; await persist(); }
  } catch { /* retain pendingFlush for retry */ } finally { idleFlushInFlight = false; }
}
function json(res, status, payload) { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(payload)); }

async function proxyToVercel(req, res, body) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = { "x-omniroute-forwarded": "1", "x-omniroute-forwarded-from": "render" };
    if (INTERNAL_SECRET) headers.authorization = `Bearer ${INTERNAL_SECRET}`;
    const upstream = await fetch(`${VERCEL_URL}${req.url}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body, signal: controller.signal });
    res.writeHead(upstream.status, Object.fromEntries(upstream.headers)); if (upstream.body) for await (const chunk of upstream.body) res.write(chunk); res.end();
  } catch { json(res, 502, { error: { message: "Render local handler failed and Vercel fallback is unavailable", code: "render_unavailable" } }); }
  finally { clearTimeout(timer); }
}

await loadRuntimeConfig();
await loadState();
const app = next({ dev: false, dir: process.cwd(), hostname: "0.0.0.0", port: PORT });
await app.prepare();
const nextHandler = app.getRequestHandler();
const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") return json(res, 200, { ok: true, service: "omniroute-render", mode: "local-next-long-poll-file-store", stateVersion: state.version });
  if (req.url === "/internal/state" && req.method === "GET") return json(res, 200, { ok: true, state });
  if (req.url === "/internal/flush" && req.method === "POST") { await flushToVercel("manual"); return json(res, 200, { ok: true, pendingFlush: state.pendingFlush }); }
  state.metrics.requests += 1; recordChange("request_started", { method: req.method, path: req.url }); await persist();
  try { await nextHandler(req, res); state.metrics.local += 1; recordChange("request_completed", { method: req.method, path: req.url }); await persist(); }
  catch { state.metrics.errors += 1; await persist(); if (!res.headersSent) await proxyToVercel(req, res, Buffer.alloc(0)); }
});
setInterval(async () => { if (Date.now() - lastActivity >= IDLE_FLUSH_MS) await flushToVercel("idle"); }, POLL_MS).unref();
server.listen(PORT, "0.0.0.0", () => console.log(`omniroute-render listening on ${PORT}; long-polling every ${POLL_MS}ms`));
