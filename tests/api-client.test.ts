import assert from "node:assert/strict";
import test from "node:test";
import { api, ApiClientError } from "../src/api.js";

test("browser API client converts non-JSON edge responses into a stable typed error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>temporary edge error</html>", {
    status: 502,
    headers: { "Content-Type": "text/html" },
  });
  try {
    await assert.rejects(
      api("/api/session"),
      (reason: unknown) => reason instanceof ApiClientError
        && reason.code === "INVALID_RESPONSE"
        && reason.status === 502
        && reason.message === "The service is temporarily unavailable.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
