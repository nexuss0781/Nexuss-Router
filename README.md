# OmniRoute Vercel AI Gateway

A lean Vercel-compatible AI gateway profile for OmniRoute using Parad-DB as the request-scoped persistence layer. It exposes OpenAI-compatible AI routes without exposing provider credentials to client applications.

> This repository does not provide a shared public gateway endpoint or shared gateway key. Deploy your own Vercel project and use your own credentials and provider configuration.

## Single dynamic chat endpoint

Use one endpoint and let the gateway select an available free model dynamically:

```text
POST /api/v1/chat/completions
```

Set `model` to `auto`, or omit it. Use `auto/<provider-id>` when automatic selection should stay within one configured provider:

```json
{
  "model": "auto",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

Global `auto` ranks eligible text-capable models by provider and model signals. When G4F is configured, the strongest cataloged G4F candidates are attempted first. The keyless OpenCode Zen route then provides the curated fallback sequence: `big-pickle`, `mimo-v2.5-free`, Nemotron, DeepSeek, Laguna, and HY3. Kilo, Pollinations, and other configured providers are used afterward when eligible.

The gateway also supports provider-scoped automatic selection:

```text
auto/g4f-pollinations
auto/opencode-zen
auto/kilo-gateway
auto/pollinations
```

A retryable provider failure, including HTTP 429, temporarily cools down the affected model or provider and moves the request to the next suitable route. Automatic requests do not return an upstream 429 after fallback exhaustion; they return HTTP 503 with `provider_pool_exhausted` and `Retry-After: 5`. The response includes `x-omniroute-provider` and `x-omniroute-model` headers showing the route selected. Explicit model IDs continue to use only the requested model, while retryable failures are still normalized through the gateway’s provider-failure handling.

## Client setup

```ts
import OpenAI from "openai";

const client = new OpenAI({
  // Set OMNIROUTE_BASE_URL to your own deployed Vercel URL.
  baseURL: `${process.env.OMNIROUTE_BASE_URL}/api/v1`,
  apiKey: process.env.OMNIROUTE_GATEWAY_KEY,
});

const response = await client.chat.completions.create({
  model: "auto",
  messages: [{ role: "user", content: "Hello" }],
});
```

## Required deployment variables

Set these in Vercel. Never commit their values:

```text
DATABASE_URL
OMNIROUTE_AI_API_KEY
OMNIROUTE_VERCEL_PROFILE=ai-only
```

Optional provider variables can be added when the corresponding server-side integration is configured. Provider keys must remain in Vercel environment variables or Parad provider records, never in browser code.

## Deploy your own instance

Create a Vercel project from this repository, configure your own environment variables, and deploy it. Do not use or publish another operator’s gateway URL or key.

```bash
npm install
npm run build
vercel --prod
```

After deployment, set your own client base URL to `<your-vercel-url>/api/v1` and use your own `OMNIROUTE_AI_API_KEY` value. The repository intentionally does not document a shared live endpoint.

This project uses sql.js’s asm.js fallback in the Vercel AI-only build to avoid relying on a runtime WASM filesystem asset. The original OmniRoute Docker/SQLite deployment path is not modified by this lean profile.

## Routes

The workspace includes AI-only handlers for chat completions, completions, responses, messages, models, embeddings, rerank, classify, segment, moderations, search, web fetch, images, audio, video, music, OCR, files, batches/jobs, provider paths, and the Gemini-compatible beta path. Long-running media operations use the asynchronous jobs pattern.

## Verification

The included test scripts exercise the deployed gateway and model catalog. They expect the gateway key to be supplied through a local secret file or environment, not committed to the repository.
