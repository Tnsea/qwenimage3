/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import test from "node:test";
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
      return Promise.resolve(new Response("<!doctype html><main>Application shell</main>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
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
  assert.doesNotMatch(await response.text(), /cloudflareinsights|beacon\.min\.js/);
});

for (const path of ["/api/workspace/overview", "/api/projects", "/api/credits", "/api/account/export", "/api/api-keys", "/api/support/tickets"]) {
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
