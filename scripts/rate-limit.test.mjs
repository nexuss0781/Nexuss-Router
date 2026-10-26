import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  isRateLimitExhausted,
  rateLimitSnapshot,
  reserveRateLimitRequest,
  resetRateLimits,
} from "../src/lib/vercel-ai-gateway/rate-limit.ts";

let now = 0;
const originalDateNow = Date.now;
const tokenharbor = { id: "tokenharbor", baseUrl: "https://tokenharbor.ai/v1" };
const orcarouter = { id: "orcarouter", baseUrl: "https://api.orcarouter.ai/v1" };

beforeEach(() => {
  now = 0;
  Date.now = () => now;
  delete process.env.OMNIROUTE_RATE_LIMITS_JSON;
  resetRateLimits();
});

afterEach(() => {
  Date.now = originalDateNow;
  delete process.env.OMNIROUTE_RATE_LIMITS_JSON;
});

test("TokenHarbor request caps are shared across models and include the hourly account ceiling", () => {
  const models = ["tokenharbor/deepseek-v4-flash:free", "tokenharbor/mimo-v2.5:free"];
  for (let i = 0; i < 1800; i += 1) {
    if (i > 0 && i % 60 === 0) now += 60_001;
    const model = models[i % models.length];
    assert.equal(isRateLimitExhausted(tokenharbor, model), false, `request ${i + 1} should be under the account ceiling`);
    reserveRateLimitRequest(tokenharbor, model);
  }
  assert.equal(isRateLimitExhausted(tokenharbor, models[0]), true, "the 1,801st hourly request must be blocked");
  assert.equal(isRateLimitExhausted(tokenharbor, models[1]), true, "the hourly budget must be shared by all models");
});

test("OrcaRouter enforces both model caps and shared account caps across models", () => {
  const verify = "orcarouter/orca/orcaverify-text1.0-free";
  const hy4 = "orcarouter/tencent/hy4-preview-free";
  for (let i = 0; i < 5; i += 1) {
    assert.equal(isRateLimitExhausted(orcarouter, verify), false);
    reserveRateLimitRequest(orcarouter, verify);
  }
  assert.equal(isRateLimitExhausted(orcarouter, verify), true, "OrcaVerify's five-per-minute model ceiling must apply");
  assert.equal(isRateLimitExhausted(orcarouter, hy4), false, "the account still has room for another model");

  for (let i = 0; i < 5; i += 1) reserveRateLimitRequest(orcarouter, hy4);
  assert.equal(isRateLimitExhausted(orcarouter, hy4), true, "the shared ten-per-minute account cap must apply");
  assert.equal(isRateLimitExhausted(orcarouter, "orcarouter/deepseek/deepseek-v4-flash-free"), true);
});

test("qualified and unqualified model IDs share one per-model window and accept lower JSON overrides", () => {
  process.env.OMNIROUTE_RATE_LIMITS_JSON = JSON.stringify({
    models: { orcarouter: { "tencent/hy4-preview-free": { requestsPerMinute: 3 } } },
  });
  const qualified = "orcarouter/tencent/hy4-preview-free";
  const unqualified = "tencent/hy4-preview-free";
  reserveRateLimitRequest(orcarouter, qualified);
  reserveRateLimitRequest(orcarouter, unqualified);
  reserveRateLimitRequest(orcarouter, qualified);
  assert.equal(isRateLimitExhausted(orcarouter, unqualified), true, "both spellings must share the same three-request model budget");
  assert.equal(rateLimitSnapshot("orcarouter", qualified)?.modelLimit?.rpm?.limit, 3);
});

test("dynamic overrides cannot raise the published free-tier ceilings", () => {
  process.env.OMNIROUTE_RATE_LIMITS_JSON = JSON.stringify({
    providers: {
      tokenharbor: { requestsPerMinute: 0, requestsPerHour: 50_000 },
      orcarouter: { requestsPerMinute: 0, requestsPerDay: 5000 },
    },
    models: {
      orcarouter: {
        "tencent/hy4-preview-free": { requestsPerMinute: 0, requestsPerDay: 5000 },
      },
    },
  });
  const tokenharborSnapshot = rateLimitSnapshot("tokenharbor", "tokenharbor/mimo-v2.5:free");
  const orcaSnapshot = rateLimitSnapshot("orcarouter", "orcarouter/tencent/hy4-preview-free");
  assert.equal(tokenharborSnapshot?.account?.rpm?.limit, 60);
  assert.equal(tokenharborSnapshot?.account?.rph?.limit, 1800);
  assert.equal(orcaSnapshot?.account?.rpm?.limit, 10);
  assert.equal(orcaSnapshot?.account?.rpd?.limit, 50);
  assert.equal(orcaSnapshot?.modelLimit?.rpm?.limit, 50);
  assert.equal(orcaSnapshot?.modelLimit?.rpd?.limit, 250);
});
