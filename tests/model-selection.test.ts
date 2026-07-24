import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("model selection is sent by the UI and enforced by both generation backends", () => {
  const generator = readFileSync(new URL("../src/components/GeneratorWorkspace.tsx", import.meta.url), "utf8");
  const marketing = readFileSync(new URL("../src/components/Marketing.tsx", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server/app.ts", import.meta.url), "utf8");

  assert.match(generator, /aria-label="Image model"/);
  assert.match(generator, /disabled=\{!model\.available\}/);
  assert.match(generator, /JSON\.stringify\(\{ prompt: requestedPrompt, modelId,/);
  assert.match(marketing, /<th>Provider<\/th>/);
  const modelsPage = marketing.slice(marketing.indexOf("export function ModelsPage"), marketing.indexOf("export function PricingPage"));
  assert.doesNotMatch(modelsPage, /<th>Best for<\/th>/);
  assert.doesNotMatch(modelsPage, /\{model\.bestFor\}/);
  assert.match(marketing, /Not assigned/);
  assert.doesNotMatch(marketing, /working local preview/);
  assert.match(marketing, /models\.find\(\(model\) => model\.available\)\?\.id/);
  assert.doesNotMatch(marketing.slice(marketing.indexOf("export function ApiPage")), /"model":"local-qwen-preview"/);
  assert.match(worker, /"MODEL_UNAVAILABLE", "Choose an available image model\."/);
  assert.match(worker, /selectedModel\.provider,[\s\S]*selectedModel\.id/);
  assert.match(server, /"MODEL_UNAVAILABLE", "Choose an available image model\."/);
});
