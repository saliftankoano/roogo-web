import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRedisEnv } from "./redis-env.ts";

describe("resolveRedisEnv", () => {
  it("uses UPSTASH_REDIS_REST_* when set", () => {
    const env = {
      UPSTASH_REDIS_REST_URL: "https://u",
      UPSTASH_REDIS_REST_TOKEN: "t1",
      KV_REST_API_URL: "https://kv",
      KV_REST_API_TOKEN: "t2",
    };
    assert.deepEqual(resolveRedisEnv(env), { url: "https://u", token: "t1", source: "upstash" });
  });

  it("falls back to the Vercel KV integration variables (production)", () => {
    assert.deepEqual(resolveRedisEnv({ KV_REST_API_URL: "https://kv", KV_REST_API_TOKEN: "t2" }), {
      url: "https://kv",
      token: "t2",
      source: "kv",
    });
  });

  it("fills each value independently and ignores blanks", () => {
    const env = { UPSTASH_REDIS_REST_URL: " ", KV_REST_API_URL: "https://kv", UPSTASH_REDIS_REST_TOKEN: "t1" };
    assert.deepEqual(resolveRedisEnv(env), { url: "https://kv", token: "t1", source: "mixed" });
  });

  it("is off when a URL or token is missing", () => {
    assert.deepEqual(resolveRedisEnv({}), { url: null, token: null, source: "none" });
    assert.equal(resolveRedisEnv({ KV_REST_API_URL: "https://kv" }).url, null);
  });
});
