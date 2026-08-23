import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GatewayClient, ParadConnection } from "parad";
import {
  provisionParadRuntimeConfig,
  resolveParadRuntimeConfig,
  type ParadConfigDependencies,
  type ParadRuntimeConfig,
} from "./config.ts";
import { ParadAdapterError, toParadAdapterError } from "./errors.ts";

export interface ParadSnapshot {
  remoteVersion: number;
  bytes: Buffer;
}

export interface ParadRequestContext {
  readonly requestId: string;
  readonly config: ParadRuntimeConfig;
  readonly gateway: GatewayClient;
  readonly db: ParadConnection;
  readonly remoteVersion: number;
  readonly tempDir: string;
}

export interface ParadRequestDependencies extends ParadConfigDependencies {
  runtimeConfig?: ParadRuntimeConfig;
  gateway?: GatewayClient;
  gatewayFactory?: (config: ParadRuntimeConfig) => GatewayClient;
  connectionFactory?: (config: ParadRuntimeConfig, dbPath: string) => ParadConnection;
  tempDirFactory?: (requestId: string) => Promise<string>;
}

async function defaultTempDirFactory(requestId: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), `omniroute-parad-${requestId}-`));
}

function defaultConnectionFactory(config: ParadRuntimeConfig, dbPath: string): ParadConnection {
  return new ParadConnection({
    dbPath,
    passphrase: config.passphrase,
    gatewayUrl: config.gatewayUrl,
    apiKey: config.apiKey,
    project: config.projectName,
    databaseId: config.databaseId,
    projectId: config.projectId,
    autoSync: false,
    pullOnStartup: false,
  });
}

async function resolveConfigAndGateway(
  dependencies: ParadRequestDependencies,
): Promise<{ config: ParadRuntimeConfig; gateway: GatewayClient }> {
  const baseConfig = dependencies.runtimeConfig ?? (await resolveParadRuntimeConfig(dependencies));
  const config = dependencies.runtimeConfig
    ? baseConfig
    : await provisionParadRuntimeConfig(baseConfig, GatewayClient);
  const gateway =
    dependencies.gateway ??
    dependencies.gatewayFactory?.(config) ??
    new GatewayClient(config.gatewayUrl, config.apiKey);
  return { config, gateway };
}

async function openSnapshot(
  requestId: string,
  dependencies: ParadRequestDependencies,
): Promise<{ context: ParadRequestContext; close: () => Promise<void> }> {
  const { config, gateway } = await resolveConfigAndGateway(dependencies);
  const tempDir = await (dependencies.tempDirFactory ?? defaultTempDirFactory)(requestId);
  const dbPath = path.join(tempDir, `${config.databaseName || "omniroute"}.db`);
  const connection = (dependencies.connectionFactory ?? defaultConnectionFactory)(config, dbPath);
  let initialized = false;

  try {
    await connection.init();
    initialized = true;
    const downloaded = await gateway.download(
      config.databaseName,
      undefined,
      config.databaseId,
      config.projectId,
    );
    if (downloaded.bytes?.length) {
      await connection.engine.replaceBytes(downloaded.bytes);
    }
    const remoteVersion = downloaded.version ?? 0;
    return {
      context: {
        requestId,
        config,
        gateway,
        db: connection,
        remoteVersion,
        tempDir,
      },
      close: async () => {
        if (initialized) connection.close();
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (initialized) {
      try {
        connection.close();
      } catch {
        // Preserve the original initialization/download error.
      }
    }
    await rm(tempDir, { recursive: true, force: true });
    throw toParadAdapterError(error);
  }
}

/**
 * Run one bounded read against the latest Parad snapshot. The request never
 * enables Parad's background sync daemon and never writes shared ~/.paradox state.
 */
export async function withParadRead<T>(
  callback: (context: ParadRequestContext) => Promise<T> | T,
  dependencies: ParadRequestDependencies = {},
): Promise<T> {
  const requestId = randomUUID();
  const { context, close } = await openSnapshot(requestId, dependencies);
  try {
    return await callback(context);
  } finally {
    await close();
  }
}

/** Exported for the write wrapper and focused lifecycle tests. */
export async function openParadSnapshot(
  requestId: string,
  dependencies: ParadRequestDependencies = {},
): Promise<{ context: ParadRequestContext; close: () => Promise<void> }> {
  return openSnapshot(requestId, dependencies);
}

export function assertParadPayloadSize(bytes: Buffer, maxBytes: number): void {
  if (bytes.length > maxBytes) {
    throw new ParadAdapterError(
      "PARAD_PAYLOAD_TOO_LARGE",
      `Parad database snapshot exceeds the configured ${maxBytes}-byte limit`,
      { status: 413 },
    );
  }
}
