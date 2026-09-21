import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

function sameSecret(value: string, expected: string): boolean {
  const left = createHash("sha256").update(value).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}
function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  return url && key ? { url, key } : null;
}

export async function POST(request: Request) {
  const secret = process.env.RENDER_INTERNAL_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !supplied || !sameSecret(supplied, secret)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as any;
  if (!body?.state || body.source !== "render") return Response.json({ ok: false, error: "invalid_render_snapshot" }, { status: 400 });
  const config = supabaseConfig();
  if (!config) return Response.json({ ok: true, persisted: false, reason: "database_not_configured" });
  try {
    const response = await fetch(`${config.url}/rest/v1/ai_render_state`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: "render-primary", state_json: body.state, reason: body.reason || "idle", updated_at: new Date().toISOString() }),
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ ok: false, persisted: false, error: `database_http_${response.status}` }, { status: 502 });
    return Response.json({ ok: true, persisted: true });
  } catch (error) {
    return Response.json({ ok: false, persisted: false, error: error instanceof Error ? error.message : "database_error" }, { status: 502 });
  }
}
