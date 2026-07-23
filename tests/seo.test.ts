import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("homepage build injects the real semantic page into the first-response document", () => {
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const prerender = readFileSync(new URL("../src/prerender.tsx", import.meta.url), "utf8");
  const hero = readFileSync(new URL("../src/components/HomeHero.tsx", import.meta.url), "utf8");
  const marketing = readFileSync(new URL("../src/components/Marketing.tsx", import.meta.url), "utf8");

  assert.match(viteConfig, /renderPrerenderedHome\(\)/);
  assert.match(viteConfig, /html\.replace\(marker,/);
  assert.match(prerender, /<HomeHero \/>/);
  assert.match(prerender, /<GeneratorWorkspace/);
  assert.match(prerender, /<HomeSections/);
  assert.match(hero, /<h1 id="page-title">[\s\S]*Qwen Image 3[\s\S]*AI Image Generator Hub/);
  assert.match(hero, /Qwen Image 3 itself is not presented as[\s\S]*verified or available here/);
  assert.match(marketing, /<h2>What to know before using a Qwen Image 3 prompt\.<\/h2>/);
  assert.match(marketing, /No verified Qwen Image 3 provider is currently available here/);
  assert.match(marketing, /<img[\s\S]*alt="Qwen Image 3 prompt workflow/);
  assert.ok(new Set([...marketing.matchAll(/href="(\/[^"]+)"/g)].map((match) => match[1])).size >= 4);
});

test("entry document and discovery files expose complete crawl metadata", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");

  assert.match(index, /<title>Qwen Image 3[^<]+<\/title>/);
  assert.match(index, /<meta name="description" content="[^"]{70,160}" \/>/);
  assert.match(index, /<meta property="og:image" content="https:\/\/qwen-image-3\.net\/qwen-image-3-workflow\.png" \/>/);
  assert.match(index, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(robots, /Sitemap: https:\/\/qwen-image-3\.net\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/qwen-image-3\.net\/<\/loc>/);
});
