import { handleAiOnlyFileContent } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return handleAiOnlyFileContent(request, (await params).id); }
