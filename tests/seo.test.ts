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
  assert.match(hero, /20 welcome credits[\s\S]*Account required/);
  assert.match(hero, /Create an account to receive 20 welcome credits/);
  assert.match(hero, /aspect ratio, visual style, and[\s\S]*quality/);
  assert.doesNotMatch(hero, /provider currently configured/);
  assert.match(marketing, /<h2>Create private image results in one workspace\.<\/h2>/);
  assert.match(marketing, /select an available preview or provider model[\s\S]*aspect ratio[\s\S]*visual finish/);
  assert.match(marketing, /<img[\s\S]*alt="Qwen Image 3 Generator Hub workspace/);
  assert.doesNotMatch(marketing, /independent prompt and model-status hub/);
  assert.doesNotMatch(marketing, /Qwen Image 3 (?:turns|is|creates|generates)|(?:with|using) Qwen Image 3/);
  assert.ok(new Set([...marketing.matchAll(/href="(\/[^"]+)"/g)].map((match) => match[1])).size >= 4);
});

test("entry document and discovery files expose complete crawl metadata", () => {
  const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
  const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");

  assert.match(index, /<title>Qwen Image 3[^<]+<\/title>/);
  assert.match(index, /<meta name="description" content="[^"]{70,160}" \/>/);
  assert.match(index, /<title>Qwen Image 3 Generator Hub - Independent AI Image Workspace/);
  assert.match(index, /<meta name="description" content="Qwen Image 3 Generator Hub is an independent AI image workspace/);
  assert.doesNotMatch(index, /Qwen Image 3 is an? (?:account-based )?AI image generator/);
  assert.doesNotMatch(index, /Three free daily generations|without an account/);
  assert.match(index, /<meta property="og:image" content="https:\/\/qwen-image-3\.net\/qwen-image-3-workflow\.png" \/>/);
  assert.match(index, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(index, /<script type="application\/ld\+json">/);
  assert.match(robots, /Sitemap: https:\/\/qwen-image-3\.net\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/qwen-image-3\.net\/<\/loc>/);
});
