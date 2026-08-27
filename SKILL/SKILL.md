---
name: omniroute-ai-inference
description: Use a ready OmniRoute deployment as the single AI inference endpoint. Apply when an agent receives an OmniRoute domain or API base and needs to discover live models, choose Auto or an exact model, make chat, text, embedding, generation, media, search, or job requests, and return the result immediately.
---

# OmniRoute AI Inference

Use the ready OmniRoute deployment as one direct AI interface. The calling runtime already carries its gateway access. Begin inference immediately with the deployed endpoint supplied by the host.

## Start here

Accept either a deployed domain or an API base.

```text
https://your-omniroute-deployment.example
https://your-omniroute-deployment.example/api/v1
```

Normalize the input into `OMNIROUTE_API_BASE`:

```text
If the supplied endpoint ends with /api/v1, use it as-is.
Otherwise append /api/v1.
```

Use the host's ready gateway client for every request. Send all paths below relative to `OMNIROUTE_API_BASE`.

## Standard inference workflow

1. Request `GET /models`.
2. Read `data[].id` as the live model list.
3. Use `model: "auto"` for automatic selection, or use an exact live model ID for a chosen model.
4. Send the user task to the matching inference endpoint.
5. Read `choices[0].message.content` for chat-style responses.
6. Return the completed result and the selected model when useful.

## Choose a model

### Automatic selection

Use Auto for the normal default. OmniRoute selects a currently eligible route and performs its internal fallback sequence.

```json
{
  "model": "auto",
  "messages": [
    {"role": "user", "content": "Explain the idea in three sentences."}
  ]
}
```

Use provider-focused Auto when the task needs one live provider family:

```json
{
  "model": "auto/opencode-zen",
  "messages": [
    {"role": "user", "content": "Write a concise TypeScript function."}
  ]
}
```

### Exact model selection

Request the live catalog first, then pass one exact `data[].id` value unchanged.

```json
{
  "model": "opencode-zen/nemotron-3-ultra-free",
  "messages": [
    {"role": "user", "content": "Summarize this design brief."}
  ],
  "temperature": 0.4,
  "max_tokens": 800
}
```

Use catalog metadata to match a task to a model:

| Catalog field | Use it for |
| --- | --- |
| `id` | Exact model request value. |
| `family` | Model family preference. |
| `modality` | Text, image, audio, video, embeddings, or other task type. |
| `task_role` | Chat, code, reasoning, generation, search, or safety task. |
| `quality_tier` | Relative catalog tier. |
| `priority` | Gateway preference order. |
| `confidence` | Catalog classification confidence. |

Use this selection pattern:

```text
catalog = GET /models
models = catalog.data

if the user selected a model ID from models:
  use that exact ID
else if the user selected a provider:
  use auto/<provider>
else:
  use auto
```

## Chat inference

Send OpenAI-compatible chat payloads to `POST /chat/completions`.

```json
{
  "model": "auto",
  "messages": [
    {"role": "system", "content": "You are a precise writing assistant."},
    {"role": "user", "content": "Draft a short product announcement."}
  ],
  "temperature": 0.7,
  "max_tokens": 800
}
```

Read the result:

```text
reply = response.choices[0].message.content
selected_model = response.model
```

For streaming chat, include `"stream": true` and process the returned event stream in order.

```json
{
  "model": "auto",
  "stream": true,
  "messages": [
    {"role": "user", "content": "Write a short welcome message."}
  ]
}
```

## Live model discovery

Call `GET /models` whenever starting a new AI task, selecting a specialized model, or refreshing the available inventory.

```text
GET {OMNIROUTE_API_BASE}/models
```

The response is an OpenAI-style list:

```json
{
  "object": "list",
  "data": [
    {
      "id": "provider/model-id",
      "object": "model",
      "owned_by": "provider"
    }
  ]
}
```

Treat this live response as the model source for the current task. Use its model IDs directly in the following request.

## Complete endpoint directory

Use provider-compatible request bodies for the chosen endpoint. Use `model` where the endpoint accepts a model selection.

| Purpose | Method and path | Typical payload form |
| --- | --- | --- |
| Discover models | `GET /models` | No body. |
| Chat completions | `POST /chat/completions` | OpenAI chat `messages`, `model`, generation options. |
| Text completions | `POST /completions` | `prompt`, `model`, generation options. |
| Responses API | `POST /responses` | Responses API `input`, `model`, tools, output options. |
| Chat-compatible API | `POST /api/chat` | Chat-style JSON body. |
| Messages API | `POST /messages` | Message-style JSON body. |
| Embeddings | `POST /embeddings` | `input`, `model`, encoding options. |
| Reranking | `POST /rerank` | Query, documents, selected model. |
| Classification | `POST /classify` | Input and classification options. |
| Moderation | `POST /moderations` | Input and moderation model when selected. |
| Image generation | `POST /images/generations` | Prompt, `model`, size, quality, response options. |
| Image edits | `POST /images/edits` | Multipart image and prompt fields. |
| Image upscale | `POST /images/upscale` | Multipart image and model fields. |
| Speech synthesis | `POST /audio/speech` | Input text, voice, format, `model`. |
| Audio transcription | `POST /audio/transcriptions` | Multipart audio file, `model`, transcription options. |
| Audio translation | `POST /audio/translations` | Multipart audio file, `model`, translation options. |
| OCR | `POST /ocr` | JSON document or image reference and extraction options. |
| Segmentation | `POST /segment` | JSON media reference and segmentation options. |
| Search | `POST /search` | JSON query and search options. |
| Web fetch | `POST /web/fetch` | JSON URL and fetch options. |
| Music generation | `POST /music/generations` | Generation request; receive a job record. |
| Video generation | `POST /videos/generations` | Generation request; receive a job record. |
| Create generic job | `POST /jobs` | JSON job request. |
| List jobs | `GET /jobs` | No body. |
| Read job | `GET /jobs/{id}` | No body. |
| Cancel job | `POST /jobs/{id}/cancel` | Optional JSON body. |
| Retry job | `POST /jobs/{id}/retry` | Optional JSON body. |
| Complete job | `POST /jobs/{id}/complete` | JSON completion payload. |
| Upload file | `POST /files` | Multipart file fields. |
| List files | `GET /files` | No body. |
| Read file metadata | `GET /files/{id}` | No body. |
| Read file content | `GET /files/{id}/content` | No body. |
| Delete file | `DELETE /files/{id}` | No body. |
| Provider chat route | `POST /providers/{provider}/chat/completions` | Chat payload for a named provider route. |
| Provider embeddings route | `POST /providers/{provider}/embeddings` | Embeddings payload for a named provider route. |
| Provider image route | `POST /providers/{provider}/images/generations` | Image-generation payload for a named provider route. |
| Versioned model route | `GET /v1beta/models/{path}` | Versioned model lookup path. |

## Inference patterns

### Text task

```text
1. GET /models
2. Choose auto or an exact text-capable ID
3. POST /chat/completions
4. Return choices[0].message.content
```

### Embedding task

```json
{
  "model": "<live embedding model id>",
  "input": ["first text", "second text"]
}
```

Send this body to `POST /embeddings`. Read the returned embedding vectors from `data`.

### Image task

```json
{
  "model": "<live image model id>",
  "prompt": "An editorial copper-and-obsidian product still life",
  "size": "1024x1024"
}
```

Send this body to `POST /images/generations`. Read the generated image result from the returned response.

### Long-running generation task

```text
1. POST /music/generations or POST /videos/generations.
2. Save the returned job id.
3. GET /jobs/{id} until the job reports its completed result.
4. Return the generated asset reference to the user.
```

## Agent behavior

Begin with live model discovery, then perform the inference request directly. Keep the user’s prompt, message history, tools, response format, streaming choice, temperature, and output limit intact. State the selected model when it helps the user understand the result.

Use a compact completion report:

```text
Model: <auto-selected or exact live model>
Result: <useful completed output>
```
