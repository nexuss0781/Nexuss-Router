import { handleAiOnlyChatCompletions } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) { return handleAiOnlyChatCompletions(request); }
