import {
  getAiOnlyModels as baseGetAiOnlyModels,
  getAiGatewayHealth as baseGetAiGatewayHealth,
  handleAiOnlyChatCompletions as baseHandleAiOnlyChatCompletions,
  handleAiOnlyJsonEndpoint as baseHandleAiOnlyJsonEndpoint,
  handleAiOnlyMultipartEndpoint as baseHandleAiOnlyMultipartEndpoint,
  handleAiOnlyFileUpload as baseHandleAiOnlyFileUpload,
  handleAiOnlyFileList as baseHandleAiOnlyFileList,
  handleAiOnlyFileMetadata as baseHandleAiOnlyFileMetadata,
  handleAiOnlyFileContent as baseHandleAiOnlyFileContent,
  handleAiOnlyFileDelete as baseHandleAiOnlyFileDelete,
  handleAiJobCreate as baseHandleAiJobCreate,
  handleAiJobList as baseHandleAiJobList,
  handleAiJobGet as baseHandleAiJobGet,
  handleAiJobCancel as baseHandleAiJobCancel,
  handleAiJobRetry as baseHandleAiJobRetry,
  handleAiJobComplete as baseHandleAiJobComplete,
} from "@/lib/vercel-ai-gateway/gateway";
import { checkRenderHealth, lastRenderSkipReason, maybeForwardToRender } from "@/lib/renderFailover";

export const runtime = "nodejs";
export const maxDuration = 300;

async function route(request: Request, fallback: () => Promise<Response> | Response): Promise<Response> {
  const forwardedResponse = await maybeForwardToRender(request);
  if (forwardedResponse) return forwardedResponse;
  const response = await fallback();
  const skipReason = lastRenderSkipReason();
  if (!skipReason || !response.body) return response;
  const headers = new Headers(response.headers);
  headers.set("x-omniroute-render-skip", skipReason);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function jsonRoute(endpointName: string, options: Record<string, unknown> = {}) {
  return (request: Request) => route(request, () => baseHandleAiOnlyJsonEndpoint(request, endpointName, {}, { endpointName, ...options }));
}

export function multipartRoute(endpointName: string, options: Record<string, unknown> = {}) {
  return (request: Request) => route(request, () => baseHandleAiOnlyMultipartEndpoint(request, endpointName, {}, { endpointName, ...options }));
}

export function getAiOnlyModels(request: Request) { return route(request, () => baseGetAiOnlyModels(request)); }
export async function getAiGatewayHealth() {
  const [baseResponse, render] = await Promise.all([baseGetAiGatewayHealth(), checkRenderHealth()]);
  const baseBody = await baseResponse.json().catch(() => ({}));
  return Response.json({ ...(baseBody as Record<string, unknown>), render });
}
export function handleAiOnlyChatCompletions(request: Request, options: { providerId?: string } = {}) { return route(request, () => baseHandleAiOnlyChatCompletions(request, {}, options)); }
export function handleAiOnlyFileUpload(request: Request) { return route(request, () => baseHandleAiOnlyFileUpload(request)); }
export function handleAiOnlyFileList(request: Request) { return route(request, () => baseHandleAiOnlyFileList(request)); }
export function handleAiOnlyFileMetadata(request: Request, id: string) { return route(request, () => baseHandleAiOnlyFileMetadata(request, id)); }
export function handleAiOnlyFileContent(request: Request, id: string) { return route(request, () => baseHandleAiOnlyFileContent(request, id)); }
export function handleAiOnlyFileDelete(request: Request, id: string) { return route(request, () => baseHandleAiOnlyFileDelete(request, id)); }
export function handleAiJobCreate(request: Request, kind: string) { return route(request, () => baseHandleAiJobCreate(request, kind)); }
export function handleAiJobList(request: Request) { return route(request, () => baseHandleAiJobList(request)); }
export function handleAiJobGet(request: Request, id: string) { return route(request, () => baseHandleAiJobGet(request, id)); }
export function handleAiJobCancel(request: Request, id: string) { return route(request, () => baseHandleAiJobCancel(request, id)); }
export function handleAiJobRetry(request: Request, id: string) { return route(request, () => baseHandleAiJobRetry(request, id)); }
export function handleAiJobComplete(request: Request, id: string) { return route(request, () => baseHandleAiJobComplete(request, id)); }
