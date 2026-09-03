import { createHash } from "node:crypto";
import { claimUsageBatch, completeUsageBatch, hasSupabaseGateway } from "@/lib/supabaseGateway";
import { ensureAiGatewaySchema } from "@/lib/vercel-ai-gateway/repositories";
import { withParadWrite } from "@/lib/vercel-parad";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.OMNIROUTE_SYNC_SECRET || process.env.CRON_SECRET;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}` || expected && request.headers.get("x-sync-secret") === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "invalid_worker_secret" }, { status: 401 });
  if (!hasSupabaseGateway()) return Response.json({ error: "supabase_not_configured" }, { status: 503 });
  const rows = await claimUsageBatch(Number(process.env.OMNIROUTE_SYNC_BATCH_SIZE || 250));
  if (!rows.length) return Response.json({ ok: true, claimed: 0, synced: 0 });
  const ids = rows.map((row) => String(row.id));
  const batchId = createHash("sha256").update(ids.slice().sort().join(",")).digest("hex").slice(0, 32);
  try {
    await withParadWrite((context) => {
      ensureAiGatewaySchema(context);
      for (const row of rows) {
        context.db.execute(
          `INSERT OR IGNORE INTO ai_usage_events (id, api_key_id, provider_id, model, endpoint, status, input_tokens, output_tokens, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [String(row.id), row.api_key_id ?? null, String(row.provider_id), String(row.model), String(row.endpoint), String(row.status), row.input_tokens ?? null, row.output_tokens ?? null, row.latency_ms ?? null, String(row.created_at)],
        );
      }
      return batchId;
    }, { maxRetries: 3 });
    await completeUsageBatch(ids, batchId);
    return Response.json({ ok: true, claimed: rows.length, synced: rows.length, batchId });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error);
    await completeUsageBatch(ids, batchId, message).catch(() => undefined);
    return Response.json({ ok: false, claimed: rows.length, error: message }, { status: 502 });
  }
}

export async function GET(request: Request) { return POST(request); }
