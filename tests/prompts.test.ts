import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the removed prompts page has no navigation, footer, route, or page component", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../src/components/SiteFooter.tsx", import.meta.url), "utf8");
  const marketing = readFileSync(new URL("../src/components/Marketing.tsx", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");

  assert.doesNotMatch(app, /<PromptsPage/);
  assert.doesNotMatch(header, /["']\/prompts["']/);
  assert.doesNotMatch(footer, /["']\/prompts["']/);
  assert.doesNotMatch(marketing, /export function PromptsPage/);
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/prompts<\/loc>/);
});
