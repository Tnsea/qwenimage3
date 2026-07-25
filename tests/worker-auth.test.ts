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

test("Worker returns the immutable noindex 404 document for unknown HTML routes", async () => {
  const response = await worker.fetch(
    new Request("https://qwen-image-3.net/not-a-route"),
    environment as never,
    executionContext as never,
  );
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate, no-transform");
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /img-src 'self' data: blob: https:\/\/www\.google-analytics\.com https:\/\/region1\.google-analytics\.com https:\/\/findly\.tools https:\/\/softwarebolt\.com/);
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/);
  assert.match(csp, /connect-src 'self' https:\/\/www\.google-analytics\.com https:\/\/region1\.google-analytics\.com/);
  assert.doesNotMatch(csp, /startupfa\.me/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /(?:script-src|connect-src)[^;]*(?:findly\.tools|softwarebolt\.com)/);
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

test("draft preview paths are local-only and always noindex", async () => {
  const localResponse = await worker.fetch(
    new Request("http://127.0.0.1:8787/_preview/guides/qwen-image-3-tutorial"),
    environment as never,
    executionContext as never,
  );
  assert.equal(localResponse.status, 200);
  assert.equal(localResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await localResponse.text(), /name="qwen-draft-preview" content="enabled"/);

  const wranglerResponse = await worker.fetch(
    new Request("http://qwen-image-3.net/_preview/guides/qwen-image-3-tutorial", {
      headers: { "CF-Connecting-IP": "127.0.0.1" },
    }),
    environment as never,
    executionContext as never,
  );
  assert.equal(wranglerResponse.status, 200);
  assert.equal(wranglerResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.match(await wranglerResponse.text(), /name="qwen-draft-preview" content="enabled"/);

  const publicResponse = await worker.fetch(
    new Request("https://qwen-image-3.net/_preview/guides/qwen-image-3-tutorial"),
    environment as never,
    executionContext as never,
  );
  assert.equal(publicResponse.status, 404);
  assert.equal(publicResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.doesNotMatch(await publicResponse.text(), /name="qwen-draft-preview"/);
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
