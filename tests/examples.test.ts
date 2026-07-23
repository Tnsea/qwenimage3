import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createCatalogCore } from "../src/catalog.js";
import { exampleMedia } from "../src/exampleMedia.js";

test("the public example gallery has a local attributed reference for every visible prompt", () => {
  const catalog = createCatalogCore({
    providerId: "local-preview",
    providerModel: "local-qwen-preview",
    providerConfigured: true,
    creatorPriceLabel: "$10",
    creatorCredits: 300,
    creatorPlanned: true,
  });

  for (const prompt of catalog.prompts.slice(0, 8)) {
    const media = exampleMedia[prompt.id];
    assert.ok(media, `Missing example media for ${prompt.id}`);
    assert.ok(media.alt.length > 12, `Missing descriptive alt text for ${prompt.id}`);
    assert.match(media.sourceUrl, /^https:\/\/unsplash\.com\/photos\//);
    assert.ok(
      existsSync(join(process.cwd(), "public", media.src.replace(/^\//, ""))),
      `Missing local example asset for ${prompt.id}`,
    );
  }
});
