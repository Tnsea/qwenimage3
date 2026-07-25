import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANONICAL_SITE_ORIGIN,
  PUBLIC_INDEXABLE_PATHS,
  pageSeoForPath,
  publicCanonicalUrl,
  renderSitemap,
  rewritePublicCanonicalMetadata,
  structuredDataForPath,
} from "../src/seo.js";
import { homeFaqs, publishedContentDocuments } from "../src/content.js";

test("public route build injects semantic pages into first-response documents", () => {
  const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const prerender = readFileSync(new URL("../src/prerender.tsx", import.meta.url), "utf8");
  const hero = readFileSync(new URL("../src/components/HomeHero.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../src/components/SiteFooter.tsx", import.meta.url), "utf8");
  const marketing = readFileSync(new URL("../src/components/Marketing.tsx", import.meta.url), "utf8");

  assert.match(viteConfig, /renderPrerenderedRoute/);
  assert.match(viteConfig, /PUBLIC_INDEXABLE_PATHS/);
  assert.match(viteConfig, /const fileName = outputFileName\(path\)/);
  assert.match(prerender, /<HomeHero \/>/);
  assert.match(prerender, /<GeneratorWorkspace/);
  assert.match(prerender, /<HomeSections/);
  assert.match(hero, /<h1 id="page-title">[\s\S]*Qwen Image 3[\s\S]*AI Image Generator Hub/);
  assert.match(hero, /20 welcome credits[\s\S]*Account required/);
  assert.match(hero, /Create an account to receive 20 welcome credits/);
  assert.match(hero, /aspect ratio, visual style, and[\s\S]*quality/);
  assert.doesNotMatch(hero, /startupfa\.me|findly\.tools|softwarebolt\.com/);
  assert.doesNotMatch(footer, /startupfa\.me|Startup Fame/);
  assert.match(footer, /rel="noopener noreferrer"/);
  assert.match(footer, /href="https:\/\/findly\.tools\/https-qwen-image-3-net\?utm_source=https-qwen-image-3-net"/);
  assert.match(footer, /src="https:\/\/findly\.tools\/badges\/findly-tools-badge-light\.svg"/);
  assert.match(footer, /alt="Featured on Findly\.tools"/);
  assert.match(footer, /width=\{150\}[\s\S]*height=\{47\}/);
  assert.match(footer, /href="https:\/\/softwarebolt\.com\/product\/qwen-image-3"/);
  assert.match(footer, /src="https:\/\/softwarebolt\.com\/assets\/images\/badge-dark\.png"/);
  assert.match(footer, /alt="Software Bolt"/);
  assert.match(footer, /width=\{203\}[\s\S]*height=\{54\}[\s\S]*loading="lazy"/);
  assert.match(footer, /findly\.tools[\s\S]*softwarebolt\.com/);
  assert.match(footer, /className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:flex-nowrap"/);
  assert.match(footer, /role="group"[\s\S]*aria-label="Featured listings"/);
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
  assert.match(index, /<script id="seo-structured-data" type="application\/ld\+json">/);
  assert.match(robots, /Sitemap: https:\/\/qwen-image-3\.net\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/qwen-image-3\.net\/<\/loc>/);
});

test("every sitemap route resolves to its own public canonical", () => {
  const sitemap = readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedUrls = PUBLIC_INDEXABLE_PATHS.map((path) => publicCanonicalUrl(path));

  assert.deepEqual(sitemapUrls, expectedUrls);
  assert.equal(sitemap, renderSitemap());
  assert.equal(publicCanonicalUrl("/pricing/"), `${CANONICAL_SITE_ORIGIN}/pricing`);
  assert.equal(publicCanonicalUrl("/prompts"), null);
  assert.equal(publicCanonicalUrl("/studio"), null);
  assert.equal(publicCanonicalUrl("/verify-email"), null);
  assert.equal(publicCanonicalUrl("/not-a-route"), null);
});

test("each published content route has independent metadata and source-visible HTML", () => {
  const pages = readFileSync(new URL("../src/components/ContentPages.tsx", import.meta.url), "utf8");
  const prerender = readFileSync(new URL("../src/prerender.tsx", import.meta.url), "utf8");

  for (const document of publishedContentDocuments) {
    const seo = pageSeoForPath(document.path);

    assert.ok(seo);
    assert.equal(seo.title, document.title);
    assert.equal(seo.description, document.description);
    assert.match(pages, new RegExp(document.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(pages, /<h1>\{document\.h1\}<\/h1>/);
  assert.match(pages, /Official model, independent site\./);
  assert.match(pages, /This site has not connected or externally accepted a Qwen Image 3 provider/);
  assert.match(prerender, /<ContentArticlePage path=\{path\}/);
});

test("FAQ schema is generated from the same visible FAQ records and no HowTo schema is emitted", () => {
  const homeSchema = structuredDataForPath("/");
  const homeGraph = homeSchema["@graph"] as Array<Record<string, unknown>>;
  const homeFaq = homeGraph.find((entry) => entry["@type"] === "FAQPage");
  const homeQuestions = (homeFaq?.mainEntity as Array<{ name: string }>).map((entry) => entry.name);
  assert.deepEqual(homeQuestions, homeFaqs.map((faq) => faq.question));

  for (const document of publishedContentDocuments) {
    const schema = structuredDataForPath(document.path);
    const graph = schema["@graph"] as Array<Record<string, unknown>>;
    const faq = graph.find((entry) => entry["@type"] === "FAQPage");
    const questions = (faq?.mainEntity as Array<{ name: string }>).map((entry) => entry.name);
    assert.deepEqual(questions, document.faqs.map((entry) => entry.question));
    assert.equal(graph.some((entry) => entry["@type"] === "HowTo"), false);
    assert.equal(graph.some((entry) => entry["@type"] === (document.kind === "blog" ? "BlogPosting" : "Article")), true);
    assert.equal(graph.some((entry) => entry["@type"] === "BreadcrumbList"), true);
  }
});

test("public canonical rewriting keeps raw HTML and social metadata aligned", () => {
  const shell = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const pricingUrl = `${CANONICAL_SITE_ORIGIN}/pricing`;
  const rewritten = rewritePublicCanonicalMetadata(shell, pricingUrl);

  assert.match(rewritten, /<link rel="canonical" href="https:\/\/qwen-image-3\.net\/pricing" \/>/);
  assert.match(rewritten, /<meta property="og:url" content="https:\/\/qwen-image-3\.net\/pricing" \/>/);
  assert.doesNotMatch(rewritten, /<link rel="canonical" href="https:\/\/qwen-image-3\.net\/" \/>/);
});
