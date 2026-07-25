/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import test from "node:test";
import { ExternalRequestError, fetchWithTimeout, timeoutMs, trustedServiceUrl } from "../worker/external.js";
import { oauthStateMatches } from "../worker/index.js";
import { createAuthorizationUrl, exchangeOAuthCode, oauthMethods } from "../worker/oauth.js";
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

test("Worker OAuth state must match the initiating browser cookie", () => {
  assert.equal(oauthStateMatches("browser-state", "browser-state"), true);
  assert.equal(oauthStateMatches("browser-state", "attacker-state"), false);
  assert.equal(oauthStateMatches(undefined, "browser-state"), false);
});

test("Worker Google OAuth exchanges the code with PKCE and accepts a verified profile", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(JSON.stringify({ access_token: "google-access-token" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return new Response(JSON.stringify({
        sub: "google-subject-123",
        email: "Person@Example.com",
        email_verified: true,
        name: "Google Person",
      }), { headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const profile = await exchangeOAuthCode(oauthEnvironment, "google", "authorization-code", "pkce-verifier");
    assert.deepEqual(profile, {
      subject: "google-subject-123",
      email: "person@example.com",
      name: "Google Person",
    });
    const tokenBody = new URLSearchParams(String(calls[0]?.init?.body));
    assert.equal(tokenBody.get("client_id"), "google-client");
    assert.equal(tokenBody.get("client_secret"), "google-secret");
    assert.equal(tokenBody.get("code"), "authorization-code");
    assert.equal(tokenBody.get("code_verifier"), "pkce-verifier");
    assert.equal(tokenBody.get("grant_type"), "authorization_code");
    assert.equal(tokenBody.get("redirect_uri"), "https://qwen-image-3.net/api/auth/oauth/google/callback");
    assert.equal(
      (calls[1]?.init?.headers as Record<string, string>).Authorization,
      "Bearer google-access-token",
    );
    assert.equal(calls[0]?.init?.redirect, "manual");
    assert.equal(calls[1]?.init?.redirect, "manual");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    "not a URL",
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
  const observed: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    observed.push(init ?? {});
    return init?.redirect === "follow"
      ? new Response("ok")
      : new Response(null, { status: 302, headers: { Location: "https://redirect.example.test" } });
  };
  try {
    await assert.rejects(
      fetchWithTimeout("https://service.example.test", { redirect: undefined }, 1_000, "Test service"),
      (reason: unknown) => reason instanceof ExternalRequestError
        && reason.code === "EXTERNAL_REDIRECT_BLOCKED",
    );
    assert.equal(observed[0]?.redirect, "manual");

    const followed = await fetchWithTimeout(
      "https://service.example.test",
      { redirect: "follow" },
      1_000,
      "Test service",
    );
    assert.equal(followed.ok, true);
    assert.equal(observed[1]?.redirect, "follow");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
