import { parseUrl, type ParsedUrl } from "parad";

const DEFAULT_RESOLVER_URL = "https://paradox-domain.onrender.com/active-domain.json";
const DEFAULT_GATEWAY_URL = "https://paradox-db.onrender.com/v1";

export function normalizeParadGatewayUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

export interface ParadRuntimeConfig {
  databaseUrl: string;
  databaseName: string;
  projectName: string | null;
  passphrase: string;
  gatewayUrl: string;
  apiKey: string;
  projectId: string;
  databaseId: string;
  maxRetries: number;
  maxBytes: number;
  resolverUrl: string;
}

export interface ActiveDomainDocument {
  gatewayUrl: string;
  ttlSeconds?: number;
}

export interface ParadConfigDependencies {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

function envOrThrow(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseDatabaseUrl(databaseUrl: string): ParsedUrl {
  try {
    return parseUrl(databaseUrl);
  } catch (error) {
    throw new Error(
      `DATABASE_URL must be a valid parad:// or paradox:// connection string: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function resolveGatewayUrl(
  parsed: ParsedUrl,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
  resolverUrl: string,
): Promise<string> {
  const explicit = env.PARADOX_GATEWAY_URL?.trim() || parsed.gateway_url?.trim();
  if (explicit) return normalizeParadGatewayUrl(explicit);

  try {
    const response = await fetchImpl(resolverUrl, { method: "GET", redirect: "follow" });
    if (response.ok) {
      const document = (await response.json()) as ActiveDomainDocument;
      if (typeof document.gatewayUrl === "string" && document.gatewayUrl.trim()) {
        return normalizeParadGatewayUrl(document.gatewayUrl);
      }
    }
  } catch {
    // Discovery is best effort. The documented fallback below remains usable.
  }
  return DEFAULT_GATEWAY_URL;
}

/**
 * Resolve deployment-only configuration without calling Parad's high-level
 * connect() helper. The high-level helper persists ~/.paradox/config.json and
 * can start a background daemon, neither of which is safe for Vercel requests.
 */
export async function resolveParadRuntimeConfig(
  dependencies: ParadConfigDependencies = {},
): Promise<ParadRuntimeConfig> {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetch ?? fetch;
  const databaseUrl = envOrThrow(env, "DATABASE_URL");
  const parsed = parseDatabaseUrl(databaseUrl);
  const resolverUrl = env.PARADOX_ACTIVE_DOMAIN_URL?.trim() || DEFAULT_RESOLVER_URL;
  const gatewayUrl = await resolveGatewayUrl(parsed, env, fetchImpl, resolverUrl);
  const passphrase = env.PARADOX_PASSPHRASE?.trim() || parsed.passphrase || "";
  if (!passphrase) {
    throw new Error("Parad encryption is missing: set PARADOX_PASSPHRASE or include a passphrase in DATABASE_URL");
  }
  const apiKey = env.PARADOX_API_KEY?.trim() || parsed.token?.trim();

  if (!apiKey && !(parsed.email && parsed.password)) {
    throw new Error("Parad authentication is missing: set PARADOX_API_KEY or use authenticated DATABASE_URL");
  }

  return {
    databaseUrl,
    databaseName: parsed.name,
    projectName: parsed.project,
    passphrase,
    gatewayUrl,
    apiKey,
    projectId: "",
    databaseId: "",
    maxRetries: positiveInt(env.OMNIROUTE_PARAD_MAX_RETRIES, 2),
    maxBytes: positiveInt(env.OMNIROUTE_PARAD_MAX_BYTES, 50 * 1024 * 1024),
    resolverUrl,
  };
}

export async function provisionParadRuntimeConfig(
  config: ParadRuntimeConfig,
  GatewayClientCtor: typeof import("parad").GatewayClient,
): Promise<ParadRuntimeConfig> {
  const parsed = parseDatabaseUrl(config.databaseUrl);
  const gateway = new GatewayClientCtor(config.gatewayUrl, config.apiKey);
  let apiKey = config.apiKey;

  if (!apiKey && parsed.email && parsed.password) {
    const auth = await gateway.login(parsed.email, parsed.password);
    apiKey = auth.api_key;
  }
  if (!apiKey) throw new Error("Parad authentication did not produce an API key");

  if (!config.projectName) {
    return { ...config, apiKey };
  }

  const project = await new GatewayClientCtor(config.gatewayUrl, apiKey).ensureProject(config.projectName);
  const database = await new GatewayClientCtor(config.gatewayUrl, apiKey).ensureDatabase(
    project.id,
    config.databaseName,
  );
  return {
    ...config,
    apiKey,
    projectId: project.id,
    databaseId: database.id,
  };
}

export const paradDefaults = {
  resolverUrl: DEFAULT_RESOLVER_URL,
  gatewayUrl: DEFAULT_GATEWAY_URL,
};
