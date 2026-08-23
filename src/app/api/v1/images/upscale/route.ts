import { multipartRoute } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = multipartRoute("images/upscale", { requireModel: true, maxBytes: 4 * 1024 * 1024 });
