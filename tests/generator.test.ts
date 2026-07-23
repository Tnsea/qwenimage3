import assert from "node:assert/strict";
import test from "node:test";
import { renderGeneration } from "../server/generator.js";

test("renders the requested aspect ratio and escapes prompt text", () => {
  const result = renderGeneration({
    prompt: "Night café <script>alert(1)</script>",
    aspectRatio: "16:9",
    style: "Cinematic",
    quality: "Ultra",
  });

  assert.equal(result.width, 1344);
  assert.equal(result.height, 768);
  assert.match(result.svg, /^<svg/);
  assert.doesNotMatch(result.svg, /<script>/);
  assert.match(result.svg, /&lt;script&gt;/);
});

test("is deterministic for the same settings", () => {
  const input = {
    prompt: "A quiet bookshop on a rainy Tokyo street",
    aspectRatio: "1:1" as const,
    style: "Photorealistic" as const,
    quality: "High" as const,
  };
  assert.equal(renderGeneration(input).svg, renderGeneration(input).svg);
});
