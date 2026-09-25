import { handleAiOnlyChatCompletions } from "@/lib/aiRoute";
export const runtime = "nodejs";
export const maxDuration = 300;
type ProviderRouteContext = { params: Promise<{ provider: string }> | { provider: string } };
export async function POST(request: Request, context: ProviderRouteContext) {
  const { provider } = await context.params;
  return handleAiOnlyChatCompletions(request, { providerId: provider });
}
