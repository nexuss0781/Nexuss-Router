import { jsonRoute } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = jsonRoute("messages");
