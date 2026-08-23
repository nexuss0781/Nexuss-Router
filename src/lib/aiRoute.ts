import {
  getAiOnlyModels,
  handleAiOnlyChatCompletions,
  handleAiOnlyJsonEndpoint,
  handleAiOnlyMultipartEndpoint,
  handleAiOnlyFileUpload,
  handleAiOnlyFileList,
  handleAiOnlyFileMetadata,
  handleAiOnlyFileContent,
  handleAiOnlyFileDelete,
  handleAiJobCreate,
  handleAiJobList,
  handleAiJobGet,
  handleAiJobCancel,
  handleAiJobRetry,
  handleAiJobComplete,
} from "@/lib/vercel-ai-gateway/gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

export function jsonRoute(endpointName: string, options: Record<string, unknown> = {}) {
  return (request: Request) => handleAiOnlyJsonEndpoint(request, endpointName, {}, { endpointName, ...options });
}

export function multipartRoute(endpointName: string, options: Record<string, unknown> = {}) {
  return (request: Request) => handleAiOnlyMultipartEndpoint(request, endpointName, {}, { endpointName, ...options });
}

export { getAiOnlyModels, handleAiOnlyChatCompletions };
export { handleAiOnlyFileUpload, handleAiOnlyFileList, handleAiOnlyFileMetadata, handleAiOnlyFileContent, handleAiOnlyFileDelete };
export { handleAiJobCreate, handleAiJobList, handleAiJobGet, handleAiJobCancel, handleAiJobRetry, handleAiJobComplete };
