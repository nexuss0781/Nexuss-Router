import { handleAiJobCreate, handleAiJobList } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = (request: Request) => handleAiJobList(request);
export async function POST(request: Request) { return handleAiJobCreate(request, "generic"); }
