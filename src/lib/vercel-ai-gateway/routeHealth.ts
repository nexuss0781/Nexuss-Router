export type RouteProvider = { id: string; baseUrl: string; apiKey?: string | null };

export const MAX_COOLDOWN_MS = 5 * 60_000;
export const ROUTE_COOLDOWN_MS = 30_000;
export const PROVIDER_COOLDOWN_MS = 10_000;

const routeCooldowns = new Map<string, number>();
const failureStreaks = new Map<string, number>();
const toolFailures = new Map<string, number>();
const toolSuccesses = new Map<string, number>();

export function providerRouteKey(provider: RouteProvider): string {
  return `${provider.id}|${provider.baseUrl}|${provider.apiKey ? "keyed" : "keyless"}`;
}

export function modelRouteKey(provider: RouteProvider, model: string): string {
  return `${providerRouteKey(provider)}|${model}`;
}

export function isProviderCoolingDown(provider: RouteProvider, model: string): boolean {
  const now = Date.now();
  const providerUntil = routeCooldowns.get(providerRouteKey(provider)) || 0;
  const modelUntil = routeCooldowns.get(modelRouteKey(provider, model)) || 0;
  return providerUntil > now || modelUntil > now;
}

export function noteProviderSuccess(provider: RouteProvider, model: string): void {
  failureStreaks.delete(providerRouteKey(provider));
  failureStreaks.delete(modelRouteKey(provider, model));
}

export function noteProviderFailure(provider: RouteProvider, model: string, status: number): void {
  const now = Date.now();
  if (status === 429) {
    const key = modelRouteKey(provider, model);
    const streak = (failureStreaks.get(key) || 0) + 1;
    failureStreaks.set(key, streak);
    routeCooldowns.set(key, now + Math.min(ROUTE_COOLDOWN_MS * 2 ** (streak - 1), MAX_COOLDOWN_MS));
    return;
  }
  const credentialFailure = status === 401 || status === 402 || status === 403;
  if (!credentialFailure && status !== 408 && status < 500) return;
  // Rejected credentials mean the whole provider is unusable, so cool it down as a
  // unit. Server errors and timeouts are usually one model route being unhealthy
  // (an overloaded upstream behind a shared gateway), so cooling the provider would
  // also evict its healthy models and could empty the pool entirely.
  const key = credentialFailure ? providerRouteKey(provider) : modelRouteKey(provider, model);
  const base = credentialFailure ? PROVIDER_COOLDOWN_MS : ROUTE_COOLDOWN_MS;
  const streak = (failureStreaks.get(key) || 0) + 1;
  failureStreaks.set(key, streak);
  routeCooldowns.set(key, now + Math.min(base * 2 ** (streak - 1), MAX_COOLDOWN_MS));
}

export function noteToolResult(provider: RouteProvider, model: string, succeeded: boolean): void {
  const key = modelRouteKey(provider, model);
  if (succeeded) toolSuccesses.set(key, (toolSuccesses.get(key) || 0) + 1);
  else toolFailures.set(key, (toolFailures.get(key) || 0) + 1);
}

export function toolTally(provider: RouteProvider, model: string): { successes: number; failures: number } {
  const key = modelRouteKey(provider, model);
  return { successes: toolSuccesses.get(key) || 0, failures: toolFailures.get(key) || 0 };
}

// Providers whose models have failed more tool calls than they have served in this
// instance are deprioritised so a route that cannot do tools stops leading the pool.
export async function toolDemotedProviders(providers: RouteProvider[], modelsOf: (provider: RouteProvider) => string[] | Promise<string[]>): Promise<Map<string, boolean>> {
  const demoted = new Map<string, boolean>();
  for (const provider of providers) {
    let successes = 0;
    let failures = 0;
    for (const model of await modelsOf(provider)) {
      const key = modelRouteKey(provider, model);
      successes += toolSuccesses.get(key) || 0;
      failures += toolFailures.get(key) || 0;
    }
    // A tie is not evidence of a broken route, so only a strict loss demotes.
    demoted.set(provider.id, failures > successes);
  }
  return demoted;
}

// Test-only reset so each case starts from a clean breaker state.
export function resetRouteHealth(): void {
  routeCooldowns.clear();
  failureStreaks.clear();
  toolFailures.clear();
  toolSuccesses.clear();
}
