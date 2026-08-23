import { randomUUID } from "node:crypto";
import {
  assertParadPayloadSize,
  openParadSnapshot,
  type ParadRequestContext,
  type ParadRequestDependencies,
} from "./requestStore.ts";
import { ParadAdapterError, isParadConflict, toParadAdapterError } from "./errors.ts";

export interface ParadWriteContext extends ParadRequestContext {
  /** The snapshot version used as the upload precondition. */
  readonly expectedVersion: number;
}

export interface ParadWriteResult<T> {
  value: T;
  remoteVersion: number;
  attempts: number;
}

export interface ParadWriteOptions {
  requestId?: string;
  maxRetries?: number;
  dependencies?: ParadRequestDependencies;
}

function ensureSynchronousMutation<T>(value: T): T {
  if (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  ) {
    throw new ParadAdapterError(
      "PARAD_CONFIG_INVALID",
      "Parad mutations must be synchronous inside the SQLite transaction",
      { status: 500 },
    );
  }
  return value;
}

function rollbackQuietly(context: ParadRequestContext): void {
  try {
    context.db.execute("ROLLBACK");
  } catch {
    // Preserve the original mutation error.
  }
}

/**
 * Apply one deterministic mutation to a fresh snapshot and upload it using the
 * exact remote version observed before the mutation. A 409 discards the local
 * snapshot and retries the whole mutation from a fresh download, avoiding the
 * Parad SDK's local-wins behavior for concurrent Vercel invocations.
 */
export async function withParadWrite<T>(
  mutate: (context: ParadWriteContext) => T,
  options: ParadWriteOptions = {},
): Promise<ParadWriteResult<T>> {
  const dependencies = options.dependencies ?? {};
  const requestId = options.requestId ?? randomUUID();
  const baseRetries = options.maxRetries ?? 2;

  let lastConflict: unknown;
  for (let attempt = 1; attempt <= baseRetries + 1; attempt += 1) {
    const { context, close } = await openParadSnapshot(requestId, dependencies);
    const writeContext: ParadWriteContext = {
      ...context,
      expectedVersion: context.remoteVersion,
    };

    try {
      let value: T;
      context.db.execute("BEGIN IMMEDIATE");
      try {
        value = ensureSynchronousMutation(mutate(writeContext));
        context.db.execute("COMMIT");
      } catch (error) {
        rollbackQuietly(context);
        throw error;
      }

      const bytes = context.db.engine.getRawBytes();
      assertParadPayloadSize(bytes, context.config.maxBytes);
      const uploaded = await context.gateway.upload({
        database_name: context.config.databaseName,
        database_id: context.config.databaseId,
        project_id: context.config.projectId,
        file_bytes: bytes,
        version: context.remoteVersion,
      });

      return {
        value,
        remoteVersion: uploaded.version,
        attempts: attempt,
      };
    } catch (error) {
      if (isParadConflict(error)) {
        lastConflict = error;
        if (attempt <= baseRetries) continue;
        throw new ParadAdapterError(
          "PARAD_STORAGE_CONFLICT_RETRY_EXHAUSTED",
          `Parad storage conflict persisted after ${attempt} attempts`,
          { status: 503, retryable: true, cause: error, attempts: attempt },
        );
      }
      throw toParadAdapterError(error);
    } finally {
      await close();
    }
  }

  throw new ParadAdapterError(
    "PARAD_STORAGE_CONFLICT_RETRY_EXHAUSTED",
    "Parad storage conflict retry exhausted",
    { status: 503, retryable: true, cause: lastConflict },
  );
}
