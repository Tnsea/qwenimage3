/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import test from "node:test";
import { ExternalRequestError, fetchWithTimeout, timeoutMs, trustedServiceUrl } from "../worker/external.js";
import { createAuthorizationUrl, oauthMethods } from "../worker/oauth.js";
import type { Env } from "../worker/env.js";

const oauthEnvironment = {
  APP_BASE_URL: "https://qwen-image-3.net",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-client",
  GITHUB_CLIENT_SECRET: "github-secret",
} as Env;

test("Worker OAuth URLs use exact callbacks, state, and PKCE without exposing secrets", async () => {
  assert.deepEqual(oauthMethods(oauthEnvironment), { google: true, github: true });
  const google = new URL(await createAuthorizationUrl(oauthEnvironment, "google", "state-value", "verifier-value"));
  assert.equal(google.origin, "https://accounts.google.com");
  assert.equal(google.searchParams.get("redirect_uri"), "https://qwen-image-3.net/api/auth/oauth/google/callback");
  assert.equal(google.searchParams.get("state"), "state-value");
  assert.equal(google.searchParams.get("scope"), "openid profile email");
  assert.equal(google.searchParams.get("code_challenge_method"), "S256");
  assert.equal(google.search.includes("google-secret"), false);

  const github = new URL(await createAuthorizationUrl(oauthEnvironment, "github", "state-github", "verifier-github"));
  assert.equal(github.origin, "https://github.com");
  assert.equal(github.searchParams.get("redirect_uri"), "https://qwen-image-3.net/api/auth/oauth/github/callback");
  assert.equal(github.searchParams.get("scope"), "read:user user:email");
});

test("external URL and timeout policies are exact and bounded", () => {
  assert.equal(timeoutMs("1"), 1_000);
  assert.equal(timeoutMs("999999"), 120_000);
  assert.equal(timeoutMs("invalid", 9_000), 9_000);
  assert.equal(
    trustedServiceUrl("https://checkout.stripe.com/c/pay/test", "checkout.stripe.com", "Billing"),
    "https://checkout.stripe.com/c/pay/test",
  );
  for (const value of [
    "http://checkout.stripe.com/c/pay/test",
    "https://evil.checkout.stripe.com/c/pay/test",
    "https://checkout.stripe.com.evil.example/c/pay/test",
    "https://user:pass@checkout.stripe.com/c/pay/test",
  ]) {
    assert.throws(
      () => trustedServiceUrl(value, "checkout.stripe.com", "Billing"),
      (reason: unknown) => reason instanceof ExternalRequestError
        && reason.code === "EXTERNAL_RESPONSE_INVALID",
    );
  }
});

test("external requests reject redirects unless a caller explicitly supplies another policy", async () => {
  const originalFetch = globalThis.fetch;
  let observed: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    observed = init;
    return new Response("ok");
  };
  try {
    await fetchWithTimeout("https://service.example.test", {}, 1_000, "Test service");
    assert.equal(observed?.redirect, "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
