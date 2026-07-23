/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.js";

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
};

const executionContext = {
  passThroughOnException() {},
  waitUntil() {},
};

for (const path of ["/api/projects", "/api/credits", "/api/account/export", "/api/api-keys"]) {
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
