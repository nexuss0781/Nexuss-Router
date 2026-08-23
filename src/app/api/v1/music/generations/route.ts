import { handleAiJobCreate } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) { return handleAiJobCreate(request, "music_generation"); }
