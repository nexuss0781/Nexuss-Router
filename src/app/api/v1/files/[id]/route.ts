import { handleAiOnlyFileMetadata, handleAiOnlyFileDelete } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return handleAiOnlyFileMetadata(request, (await params).id); }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return handleAiOnlyFileDelete(request, (await params).id); }
