import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createCatalogCore } from "../src/catalog.js";
import { promptMedia } from "../src/promptMedia.js";

test("every public prompt card has a complete local image", () => {
  const catalog = createCatalogCore({
    providerId: "local-preview",
    providerModel: "local-qwen-preview",
    providerConfigured: true,
    creatorPriceLabel: "$10",
    creatorCredits: 300,
    creatorPlanned: true,
  });

  assert.equal(Object.keys(promptMedia).length, catalog.prompts.length);

  for (const prompt of catalog.prompts) {
    const media = promptMedia[prompt.id];
    assert.ok(media, `Missing prompt media for ${prompt.id}`);
    assert.ok(media.alt.length > 12, `Missing descriptive alt text for ${prompt.id}`);
    assert.ok(media.width >= 1200 && media.height >= 900, `Prompt media is too small for ${prompt.id}`);
    assert.ok(
      existsSync(join(process.cwd(), "public", media.src.replace(/^\//, ""))),
      `Missing local prompt asset for ${prompt.id}`,
    );
  }
});
