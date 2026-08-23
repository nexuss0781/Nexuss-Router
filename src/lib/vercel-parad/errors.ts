export type ParadAdapterErrorCode =
  | "PARAD_CONFIG_INVALID"
  | "PARAD_AUTH_REQUIRED"
  | "PARAD_REMOTE_NOT_FOUND"
  | "PARAD_PAYLOAD_TOO_LARGE"
  | "PARAD_STORAGE_CONFLICT"
  | "PARAD_STORAGE_CONFLICT_RETRY_EXHAUSTED"
  | "PARAD_STORAGE_UNAVAILABLE"
  | "PARAD_REQUEST_CANCELLED";

export class ParadAdapterError extends Error {
  readonly code: ParadAdapterErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly attempts?: number;

  constructor(
    code: ParadAdapterErrorCode,
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      cause?: unknown;
      attempts?: number;
    } = {},
  ) {
    super(message);
    this.name = "ParadAdapterError";
    this.code = code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
    this.attempts = options.attempts;
  }
}

export function isParadConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    Number((error as { statusCode?: unknown }).statusCode) === 409
  );
}

export function toParadAdapterError(error: unknown): ParadAdapterError {
  if (error instanceof ParadAdapterError) return error;
  if (isParadConflict(error)) {
    return new ParadAdapterError("PARAD_STORAGE_CONFLICT", "Parad database version conflict", {
      status: 409,
      retryable: true,
      cause: error,
    });
  }
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  if (statusCode >= 500 || statusCode === 0) {
    return new ParadAdapterError("PARAD_STORAGE_UNAVAILABLE", "Parad gateway is unavailable", {
      status: 503,
      retryable: true,
      cause: error,
    });
  }
  return new ParadAdapterError(
    "PARAD_CONFIG_INVALID",
    error instanceof Error ? error.message : String(error),
    { status: statusCode >= 400 ? statusCode : 500, cause: error },
  );
}
