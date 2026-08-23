import { jsonRoute } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = jsonRoute("models");
export const POST = jsonRoute("models");
