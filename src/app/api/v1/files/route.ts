import { handleAiOnlyFileUpload, handleAiOnlyFileList } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = (request: Request) => handleAiOnlyFileUpload(request);
export const GET = (request: Request) => handleAiOnlyFileList(request);
