/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_INDEXABLE_PATHS, publicCanonicalUrl } from "../src/seo.js";
import worker, { browserWriteOriginAllowed } from "../worker/index.js";

const environment = {
  APP_BASE_URL: "https://qwen-image-3.net",
  BILLING_ENABLED: "false",
  GENERATION_PROVIDER: "local",
  QWEN_MODEL_ID: "local-qwen-preview",
  DB: {
    prepare() {
      throw new Error("Unauthenticated protected routes must not query D1.");
    },
  },
  ASSETS: {
    fetch() {
      return Promise.resolve(new Response("<!doctype html><head><link rel=\"canonical\" href=\"https://qwen-image-3.net/\" /><meta property=\"og:url\" content=\"https://qwen-image-3.net/\" /></head><body><main>Application shell</main></body>", {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": "1000",
          "ETag": "\"shared-shell\"",
        },
      }));
    },
  },
};

const executionContext = {
  passThroughOnException() {},
  waitUntil() {},
};

test("Worker browser writes accept the served origin for preview and Wrangler while rejecting foreign origins", () => {
  assert.equal(browserWriteOriginAllowed(new Request("http://127.0.0.1:8787/api/generations", {
    method: "POST",
    headers: { Origin: "http://127.0.0.1:8787", "Sec-Fetch-Site": "same-origin" },
  }), environment.APP_BASE_URL), true);
  assert.equal(browserWriteOriginAllowed(new Request("https://hardening.qwen-image-3.workers.dev/api/generations", {
    method: "POST",
    headers: { Origin: "https://hardening.qwen-image-3.workers.dev", "Sec-Fetch-Site": "same-origin" },
  }), environment.APP_BASE_URL), true);
  assert.equal(browserWriteOriginAllowed(new Request("https://qwen-image-3.net/api/generations", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
  }), environment.APP_BASE_URL), false);
});

test("Worker HTML is immutable to edge transforms so Cloudflare cannot inject an analytics beacon", async () => {
  const response = await worker.fetch(
    new Request("https://qwen-image-3.net/not-a-route"),
    environment as never,
    executionContext as never,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate, no-transform");
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /img-src 'self' data: blob: https:\/\/www\.google-analytics\.com https:\/\/region1\.google-analytics\.com https:\/\/startupfa\.me https:\/\/findly\.tools/);
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/www\.google-analytics\.com https:\/\/region1\.google-analytics\.com/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /(?:script-src|connect-src)[^;]*(?:startupfa\.me|findly\.tools)/);
  assert.doesNotMatch(await response.text(), /cloudflareinsights|beacon\.min\.js/);
});

test("Worker permanently redirects the removed prompts page to examples", async () => {
  const response = await worker.fetch(
    new Request("https://qwen-image-3.net/prompts?source=legacy"),
    environment as never,
    executionContext as never,
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://qwen-image-3.net/examples?source=legacy");
});

for (const path of PUBLIC_INDEXABLE_PATHS) {
  test(`Worker emits a self-referencing canonical for ${path}`, async () => {
    const response = await worker.fetch(
      new Request(`https://qwen-image-3.net${path}`),
      environment as never,
      executionContext as never,
    );
    const canonicalUrl = publicCanonicalUrl(path);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.ok(canonicalUrl);
    assert.match(body, new RegExp(`<link rel="canonical" href="${canonicalUrl}"`));
    assert.match(body, new RegExp(`<meta property="og:url" content="${canonicalUrl}"`));
    assert.equal(response.headers.get("content-length"), null);
    assert.equal(response.headers.get("etag"), null);
  });
}

for (const path of ["/api/workspace/overview", "/api/projects", "/api/credits", "/api/account/export", "/api/api-keys", "/api/support/tickets", "/api/generations"]) {
  test(`Cloudflare protected route ${path} returns structured 401 without a session`, async () => {
    const response = await worker.fetch(
      new Request(`https://qwen-image-3.net${path}`),
      environment as never,
      executionContext as never,
    );

    assert.equal(response.status, 401);
    const body = await response.json() as { error: { code: string; message: string; requestId: string } };
    assert.equal(body.error.code, "UNAUTHENTICATED");
    assert.equal(body.error.message, "Sign in to continue.");
    assert.match(body.error.requestId, /^[0-9a-f-]{36}$/);
  });
}
