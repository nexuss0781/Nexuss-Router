import { createHash, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 10;

const CONFIG_KEYS = [
  "OMNIROUTE_AI_API_KEY",
  "OMNIROUTE_VERCEL_PROFILE",
  "DATABASE_URL",
  "PARADOX_PASSPHRASE",
  "PARADOX_API_KEY",
] as const;

function sameSecret(value: string, expected: string): boolean {
  const left = createHash("sha256").update(value).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const expected = process.env.RENDER_INTERNAL_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied || !sameSecret(supplied, expected)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const values = Object.fromEntries(CONFIG_KEYS.map((key) => [key, process.env[key] || ""]));
  return Response.json({ ok: true, values }, { headers: { "cache-control": "no-store" } });
}
