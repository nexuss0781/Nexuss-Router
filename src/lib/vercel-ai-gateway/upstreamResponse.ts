export type UpstreamFailure = { retryable: boolean; code: string; message: string };

export function classifyUpstreamStatus(status: number): UpstreamFailure | null {
  if (status >= 200 && status < 300) return null;
  if (status === 400) return { retryable: false, code: "bad_request", message: "The upstream provider rejected the request payload" };
  if (status === 404) return { retryable: false, code: "not_found", message: "The upstream provider could not find the requested resource or model" };
  if (status === 405) return { retryable: false, code: "method_not_allowed", message: "The upstream provider rejected the HTTP method" };
  if (status === 413) return { retryable: false, code: "payload_too_large", message: "The upstream provider rejected the payload size" };
  if (status === 415) return { retryable: false, code: "unsupported_media_type", message: "The upstream provider rejected the media type" };
  if (status === 422) return { retryable: false, code: "unprocessable_entity", message: "The upstream provider rejected the request content" };
  if (status === 401 || status === 403) return { retryable: true, code: "provider_authentication_failed", message: "The upstream provider rejected the gateway credentials" };
  if (status === 402) return { retryable: true, code: "provider_quota_exceeded", message: "The upstream provider reported insufficient account credit" };
  if (status === 408 || status === 504) return { retryable: true, code: "provider_timeout", message: "The upstream provider did not respond in time" };
  if (status === 429) return { retryable: true, code: "provider_rate_limited", message: "The upstream provider rate-limited the request" };
  if (status >= 500) return { retryable: true, code: "provider_server_error", message: "The upstream provider returned a server error" };
  return { retryable: true, code: "provider_unavailable", message: "The upstream provider could not serve the request" };
}

export function isEventStream(contentType: string | null): boolean {
  return typeof contentType === "string" && contentType.toLowerCase().includes("text/event-stream");
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Classifies the first SSE data frame. Overloaded upstreams often open a 200
// event-stream and put the error in the first frame, which would otherwise reach
// the client as a stream that ends without [DONE] or with no tool call.
export function classifyFirstStreamFrame(text: string): UpstreamFailure | null {
  for (const block of text.split("\n")) {
    const trimmed = block.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }
    // Streamed frames carry no HTTP status of their own, so the body code is the
    // only signal available here.
    const envelope = providerErrorEnvelope(parsed);
    if (envelope) return envelope.failure;
    return null;
  }
  return null;
}

export type StreamPreflight = {
  inspect: () => Promise<UpstreamFailure | null>;
  stream: ReadableStream<Uint8Array>;
  cancel: () => Promise<void>;
};

// Reads just enough of an upstream stream to see whether it opens with an error
// frame. The consumed bytes are replayed on the returned stream, and the wait is
// bounded by budgetMs so a slow first token does not delay response headers.
export function preflightStream(body: ReadableStream<Uint8Array>, options: { maxBytes?: number; budgetMs?: number } = {}): StreamPreflight {
  const maxBytes = options.maxBytes ?? 8192;
  const budgetMs = options.budgetMs ?? 1200;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  let closed = false;

  const readNext = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (!pending) {
      pending = reader.read().then(
        (result) => {
          pending = null;
          if (result.done) closed = true;
          return result;
        },
        (error) => {
          pending = null;
          throw error;
        },
      );
    }
    return pending;
  };

  async function inspect(): Promise<UpstreamFailure | null> {
    const deadline = Date.now() + budgetMs;
    while (bufferedBytes < maxBytes) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: ReadableStreamReadResult<Uint8Array> | "timeout";
      try {
        result = await Promise.race<ReadableStreamReadResult<Uint8Array> | "timeout">([
          readNext(),
          new Promise<"timeout">((resolve) => {
            timer = setTimeout(() => resolve("timeout"), remaining);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (result === "timeout") break;
      if (result.done) break;
      buffered.push(result.value);
      bufferedBytes += result.value.byteLength;
      if (decoder.decode(concatChunks(buffered)).includes("\n\n")) break;
    }
    const text = decoder.decode(concatChunks(buffered));
    const failure = classifyFirstStreamFrame(text);
    if (failure) return failure;
    if (closed && bufferedBytes === 0) {
      return { retryable: true, code: "provider_empty_stream", message: "The upstream provider closed the stream without sending any data" };
    }
    return null;
  }

  // Built lazily on first access so the stream cannot start pulling while
  // inspect() is still consuming the opening frames; that race would replay the
  // peeked bytes twice.
  let built: ReadableStream<Uint8Array> | null = null;
  const stream = (): ReadableStream<Uint8Array> => {
    if (built) return built;
    built = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const bufferedNow = buffered.splice(0, buffered.length);
        for (const chunk of bufferedNow) controller.enqueue(chunk);
        if (closed) {
          controller.close();
          return;
        }
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await readNext();
        } catch (error) {
          controller.error(error);
          return;
        }
        if (result.done) {
          controller.close();
          return;
        }
        controller.enqueue(result.value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    return built;
  };

  return {
    inspect,
    get stream() {
      return stream();
    },
    cancel: () => reader.cancel().then(() => undefined),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// Some upstreams answer HTTP 200 with an error envelope instead of a status code
// (kilo-gateway relays Nvidia overloads this way, for example). Forwarding that as a
// completion hands the client a 200 with no choices, so classify it as a failure and
// let the next route serve the request.
export function providerErrorEnvelope(body: unknown, httpStatus?: number): { status: number; failure: UpstreamFailure } | null {
  const record = asRecord(body);
  if (!record) return null;
  if (Array.isArray(record.choices) || Array.isArray(record.output)) return null;
  const error = asRecord(record.error);
  if (!error) return null;
  const metadata = asRecord(error.metadata);
  const errorType = typeof metadata?.error_type === "string" ? metadata.error_type : typeof error.type === "string" ? error.type : null;
  const numericCode = typeof error.code === "number" ? error.code : typeof error.code === "string" && /^\d{3}$/.test(error.code) ? Number(error.code) : null;
  // The wire status is authoritative. A body code is only a fallback, because
  // aggregators reuse one error shape for several distinct failures and a
  // mismatch there misroutes the attempt and books the wrong failure budget.
  const wireStatus = typeof httpStatus === "number" && httpStatus >= 400 && httpStatus <= 599 ? httpStatus : null;
  const status = wireStatus ?? (numericCode && numericCode >= 400 && numericCode <= 599 ? numericCode : 502);
  const message = typeof error.message === "string" && error.message.trim() ? error.message.trim() : "The upstream provider returned an error envelope";
  if (errorType === "provider_overloaded") return { status, failure: { retryable: true, code: "provider_overloaded", message } };
  if (errorType === "rate_limit_exceeded") return { status, failure: { retryable: true, code: "provider_rate_limited", message } };
  const classified = classifyUpstreamStatus(status);
  return { status, failure: { ...(classified ?? { retryable: true, code: "provider_unavailable", message }), message } };
}
