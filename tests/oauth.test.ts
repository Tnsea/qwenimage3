import assert from "node:assert/strict";
import test from "node:test";
import { createAuthorizationUrl, createPkceChallenge, exchangeOAuthCode, oauthMethods } from "../server/oauth.js";

process.env.APP_BASE_URL = "https://images.example.com";
process.env.GOOGLE_CLIENT_ID = "google-client";
process.env.GOOGLE_CLIENT_SECRET = "google-secret";
process.env.GITHUB_CLIENT_ID = "github-client";
process.env.GITHUB_CLIENT_SECRET = "github-secret";

test("OAuth authorization URLs use state, PKCE, minimal identity scopes, and exact callbacks", () => {
  assert.deepEqual(oauthMethods(), { google: true, github: true });
  assert.equal(createPkceChallenge("verifier"), "iMnq5o6zALKXGivsnlom_0F5_WYda32GHkxlV7mq7hQ");

  const google = new URL(createAuthorizationUrl("google", "state-value", "verifier"));
  assert.equal(google.origin, "https://accounts.google.com");
  assert.equal(google.pathname, "/o/oauth2/v2/auth");
  assert.equal(google.searchParams.get("state"), "state-value");
  assert.equal(google.searchParams.get("scope"), "openid profile email");
  assert.equal(google.searchParams.get("redirect_uri"), "https://images.example.com/api/auth/oauth/google/callback");
  assert.equal(google.searchParams.get("code_challenge_method"), "S256");

  const github = new URL(createAuthorizationUrl("github", "another-state", "verifier"));
  assert.equal(github.origin, "https://github.com");
  assert.equal(github.pathname, "/login/oauth/authorize");
  assert.equal(github.searchParams.get("scope"), "read:user user:email");
  assert.equal(github.searchParams.get("redirect_uri"), "https://images.example.com/api/auth/oauth/github/callback");
});

test("Google code exchange returns only a durable verified identity profile", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") return new Response(JSON.stringify({ access_token: "google-access" }), { status: 200 });
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return new Response(JSON.stringify({ sub: "google-123", email: "Person@Example.com", email_verified: true, name: "Google Person" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  try {
    const profile = await exchangeOAuthCode("google", "auth-code", "pkce-verifier");
    assert.deepEqual(profile, { subject: "google-123", email: "person@example.com", name: "Google Person" });
    const body = calls[0].init?.body as URLSearchParams;
    assert.equal(body.get("code_verifier"), "pkce-verifier");
    assert.equal(body.get("redirect_uri"), "https://images.example.com/api/auth/oauth/google/callback");
    assert.equal(calls[1].init?.headers && (calls[1].init.headers as Record<string, string>).Authorization, "Bearer google-access");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub code exchange falls back to the primary verified email", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://github.com/login/oauth/access_token") return new Response(JSON.stringify({ access_token: "github-access" }), { status: 200 });
    if (url === "https://api.github.com/user") return new Response(JSON.stringify({ id: 8842, login: "octo-person", name: null, email: null }), { status: 200 });
    if (url === "https://api.github.com/user/emails") {
      return new Response(JSON.stringify([
        { email: "secondary@example.com", primary: false, verified: true },
        { email: "primary@example.com", primary: true, verified: true },
      ]), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  try {
    const profile = await exchangeOAuthCode("github", "github-code", "github-verifier");
    assert.deepEqual(profile, { subject: "8842", email: "primary@example.com", name: "octo-person" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
