import { getAiGatewayHealth } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() { return getAiGatewayHealth(); }