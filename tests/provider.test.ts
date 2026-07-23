import assert from "node:assert/strict";
import test from "node:test";
import { ProviderError } from "../server/providers/types.js";
import { QwenImageProvider } from "../server/providers/qwen.js";

test("Qwen provider maps the product request to the official synchronous API and downloads the asset", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({ url, init });
    if (requests.length === 1) {
      return new Response(JSON.stringify({
        requestId: "request-1",
        output: { choices: [{ message: { role: "assistant", content: [{ image: "https://assets.example.com/result.png" }] } }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(png, { status: 200, headers: { "Content-Type": "image/png", "Content-Length": String(png.byteLength) } });
  };
  const provider = new QwenImageProvider({
    apiKey: "sk-test",
    baseUrl: "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/",
    model: "qwen-image-2.0-pro",
    fetchImpl,
    allowedImageHosts: ["example.com"],
    resolveHostname: async () => ["93.184.216.34"],
  });

  const result = await provider.generate({
    prompt: "A quiet bookshop on a rainy Tokyo street",
    aspectRatio: "16:9",
    style: "Cinematic",
    quality: "Ultra",
  });

  assert.equal(requests[0].url, "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
  assert.equal((requests[0].init?.headers as Record<string, string>).Authorization, "Bearer sk-test");
  const requestBody = JSON.parse(String(requests[0].init?.body));
  assert.equal(requestBody.model, "qwen-image-2.0-pro");
  assert.equal(requestBody.parameters.size, "2688*1536");
  assert.equal(requestBody.parameters.watermark, false);
  assert.match(requestBody.input.messages[0].content[0].text, /cinematic/i);
  assert.equal(requests[1].url, "https://assets.example.com/result.png");
  assert.equal(result.width, 2688);
  assert.equal(result.height, 1536);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.provider, "alibaba-model-studio");
  assert.deepEqual(result.data, png);
});

test("Qwen provider blocks provider assets that resolve to private networks", async () => {
  const provider = new QwenImageProvider({
    apiKey: "sk-test",
    baseUrl: "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1",
    allowedImageHosts: ["example.com"],
    resolveHostname: async () => ["127.0.0.1"],
    fetchImpl: async () => new Response(JSON.stringify({
      output: { choices: [{ message: { content: [{ image: "https://assets.example.com/internal.png" }] } }] },
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(
    provider.generate({ prompt: "A safe prompt", aspectRatio: "1:1", style: "Editorial", quality: "Standard" }),
    (error: unknown) => error instanceof ProviderError && error.code === "INVALID_PROVIDER_RESPONSE",
  );
});

test("Qwen provider maps provider moderation to a product-safe error", async () => {
  const provider = new QwenImageProvider({
    apiKey: "sk-test",
    baseUrl: "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1",
    fetchImpl: async () => new Response(JSON.stringify({ code: "DataInspectionFailed", message: "provider detail" }), { status: 400, headers: { "Content-Type": "application/json" } }),
  });

  await assert.rejects(
    provider.generate({ prompt: "A blocked request", aspectRatio: "1:1", style: "Illustration", quality: "Standard" }),
    (error: unknown) => error instanceof ProviderError && error.code === "CONTENT_BLOCKED" && !error.message.includes("provider detail"),
  );
});
