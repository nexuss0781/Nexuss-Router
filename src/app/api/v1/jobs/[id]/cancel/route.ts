import { handleAiJobCancel } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return handleAiJobCancel(request, (await params).id); }
