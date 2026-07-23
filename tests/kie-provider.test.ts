import assert from "node:assert/strict";
import test from "node:test";
import { KIE_QWEN_MODEL_ID } from "../src/catalog.js";
import { ExternalRequestError } from "../worker/external.js";
import { KieQwenImageProvider } from "../worker/kie.js";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

test("Kie.ai Qwen provider creates, polls, validates, and downloads one image", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let clock = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, init });
    if (requests.length === 1) {
      return Response.json({ code: 200, msg: "success", data: { taskId: "task_qwen_1" } });
    }
    if (requests.length === 2) {
      return Response.json({ code: 200, msg: "success", data: { taskId: "task_qwen_1", state: "generating" } });
    }
    if (requests.length === 3) {
      return Response.json({
        code: 200,
        msg: "success",
        data: {
          taskId: "task_qwen_1",
          state: "success",
          resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/qwen/result.png"] }),
        },
      });
    }
    return new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(png.byteLength) },
    });
  };
  const provider = new KieQwenImageProvider({
    apiKey: "kie-test",
    baseUrl: "https://api.kie.ai",
    allowedApiHost: "api.kie.ai",
    allowedImageHosts: ["tempfile.aiquickdraw.com", "file.aiquickdraw.com"],
    fetchImpl,
    pollIntervalMs: 500,
    maxPollMs: 5_000,
    now: () => clock,
    sleep: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  const result = await provider.generate({
    prompt: "A quiet bookshop on a rainy Tokyo street",
    aspectRatio: "16:9",
    style: "Cinematic",
    quality: "Standard",
  });

  assert.equal(requests[0].url, "https://api.kie.ai/api/v1/jobs/createTask");
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, "Bearer kie-test");
  const body = JSON.parse(String(requests[0].init?.body));
  assert.equal(body.model, KIE_QWEN_MODEL_ID);
  assert.equal(body.input.image_size, "16:9");
  assert.equal(body.input.output_format, "png");
  assert.match(body.input.prompt, /cinematic/i);
  assert.equal(body.callBackUrl, undefined);
  assert.equal(requests[1].url, "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_qwen_1");
  assert.equal(requests[2].url, "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_qwen_1");
  assert.equal(requests[3].url, "https://tempfile.aiquickdraw.com/qwen/result.png");
  assert.equal(result.width, 2048);
  assert.equal(result.height, 1152);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.provider, "kie-ai");
  assert.equal(result.model, KIE_QWEN_MODEL_ID);
  assert.equal(result.taskId, "task_qwen_1");
  assert.deepEqual(result.bytes, png);
});

test("Kie.ai Qwen provider rejects result hosts outside the exact allowlist", async () => {
  let requestCount = 0;
  const provider = new KieQwenImageProvider({
    apiKey: "kie-test",
    baseUrl: "https://api.kie.ai",
    allowedApiHost: "api.kie.ai",
    allowedImageHosts: ["tempfile.aiquickdraw.com"],
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) return Response.json({ code: 200, data: { taskId: "task_qwen_2" } });
      return Response.json({
        code: 200,
        data: {
          taskId: "task_qwen_2",
          state: "success",
          resultJson: JSON.stringify({ resultUrls: ["https://untrusted.example/result.png"] }),
        },
      });
    },
  });

  await assert.rejects(
    provider.generate({ prompt: "A safe prompt", aspectRatio: "1:1", style: "Editorial", quality: "Standard" }),
    (error: unknown) => error instanceof ExternalRequestError && error.code === "PROVIDER_ASSET_REJECTED",
  );
  assert.equal(requestCount, 2);
});

test("Kie.ai Qwen provider maps failed tasks without leaking provider details", async () => {
  let requestCount = 0;
  const provider = new KieQwenImageProvider({
    apiKey: "kie-test",
    baseUrl: "https://api.kie.ai",
    allowedApiHost: "api.kie.ai",
    allowedImageHosts: ["tempfile.aiquickdraw.com"],
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) return Response.json({ code: 200, data: { taskId: "task_qwen_3" } });
      return Response.json({
        code: 200,
        data: {
          taskId: "task_qwen_3",
          state: "fail",
          failCode: "provider_internal",
          failMsg: "sensitive provider detail",
        },
      });
    },
  });

  await assert.rejects(
    provider.generate({ prompt: "A blocked prompt", aspectRatio: "1:1", style: "Illustration", quality: "Standard" }),
    (error: unknown) => error instanceof ExternalRequestError
      && error.code === "PROVIDER_REJECTED"
      && error.publicMessage === "The image provider could not complete this request."
      && !error.publicMessage.includes("sensitive"),
  );
});

test("Kie.ai Qwen provider rejects unsupported settings before creating a task", async () => {
  let called = false;
  const provider = new KieQwenImageProvider({
    apiKey: "kie-test",
    baseUrl: "https://api.kie.ai",
    allowedApiHost: "api.kie.ai",
    allowedImageHosts: ["tempfile.aiquickdraw.com"],
    fetchImpl: async () => {
      called = true;
      throw new Error("fetch should not run");
    },
  });

  await assert.rejects(
    provider.generate({ prompt: "A safe prompt", aspectRatio: "3:2", style: "Editorial", quality: "Standard" }),
    (error: unknown) => error instanceof ExternalRequestError && error.code === "PROVIDER_REQUEST_UNSUPPORTED",
  );
  await assert.rejects(
    provider.generate({ prompt: "A safe prompt", aspectRatio: "1:1", style: "Editorial", quality: "High" }),
    (error: unknown) => error instanceof ExternalRequestError && error.code === "PROVIDER_REQUEST_UNSUPPORTED",
  );
  assert.equal(called, false);
});
