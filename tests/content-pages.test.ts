import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contentDocumentForPath,
  contentDocumentsForKind,
  homeFaqs,
  promptExamples,
  publishedContentDocuments,
} from "../src/content.js";

const expectedPaths = [
  "/blog/qwen-image-3-vs-midjourney",
  "/guides/how-to-generate-ai-images-with-qwen-image-3",
  "/guides/best-prompts-for-qwen-image-3",
  "/guides/qwen-image-3-tutorial",
];

test("the content manifest publishes the four planned routes and both hubs surface them", () => {
  assert.deepEqual(publishedContentDocuments.map((document) => document.path), expectedPaths);
  assert.equal(contentDocumentsForKind("guide").length, 3);
  assert.equal(contentDocumentsForKind("blog").length, 1);

  const pages = readFileSync(new URL("../src/components/ContentPages.tsx", import.meta.url), "utf8");
  assert.match(pages, /export function GuidesHubPage/);
  assert.match(pages, /export function BlogHubPage/);
  for (const document of publishedContentDocuments) {
    assert.match(pages, new RegExp(document.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("planned H2 sequences remain in source order", () => {
  const source = readFileSync(new URL("../src/components/ContentPages.tsx", import.meta.url), "utf8");
  const sequences = [
    [
      "Quick Verdict: Who Should Use Which?",
      "What Is Qwen Image 3?",
      "What Is Midjourney?",
      "Side-by-Side Comparison Table",
      "Text Rendering Accuracy — Qwen Image 3",
      "Prompt Length: 4.5k Tokens vs Midjourney",
      "Multilingual Image Generation",
      "Pricing Comparison",
      "When to Use Qwen Image 3",
      "When to Use Midjourney",
    ],
    [
      "What You Need Before Starting",
      "Step 1 — Write Your First Prompt",
      "Step 2 — Choose the Right Model",
      "Step 3 — Select Aspect Ratio",
      "Step 4 — Generate and Review",
      "Step 5 — Download and Use Your Image",
      "Pro Tips for Better Results",
      "Common Mistakes to Avoid",
    ],
    [
      "Qwen Image 3 Quick Overview",
      "What Is Qwen Image 3?",
      "Rich Content: 4.5k-Token Prompts",
      "Authentic Details: Text Down to About 10px",
      "Deep Knowledge: 12 Languages and Complex Interfaces",
      "How to Access Qwen Image 3",
      "How to Structure a Qwen Image 3 Prompt",
      "Text-to-Image and Image Editing",
      "Best Use Cases",
      "Limitations and Verification Notes",
      "Continue With the Step-by-Step Guide",
      "Explore 50+ Prompt Examples",
      "Qwen Image 3 vs Midjourney",
    ],
  ];

  for (const sequence of sequences) {
    let previous = -1;
    for (const heading of sequence) {
      const next = source.indexOf(heading, previous + 1);
      assert.ok(next > previous, `${heading} should follow the previous planned heading`);
      previous = next;
    }
  }
});

test("the prompt library contains exactly ten curated examples in each planned category", () => {
  assert.equal(promptExamples.length, 50);
  assert.equal(new Set(promptExamples.map((example) => example.id)).size, 50);
  assert.equal(promptExamples.every((example) => example.tested === false), true);
  assert.equal(promptExamples.every((example) => example.testRecord.status === "not-run"), true);
  assert.equal(promptExamples.every((example) => example.testRecord.testedAt === null && example.testRecord.entryPoint === null && example.testRecord.result === null), true);

  for (const category of [
    "Poster & Flyer",
    "UI & App Mockup",
    "Infographic & Data Visualization",
    "Storyboard & Scene",
    "Product Photography",
  ]) {
    assert.equal(promptExamples.filter((example) => example.category === category).length, 10);
  }
});

test("prompt handoff is bounded, prefill-only, and preserves the curated disclosure", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const pages = readFileSync(new URL("../src/components/ContentPages.tsx", import.meta.url), "utf8");

  assert.match(app, /prompt\.slice\(0, 800\)/);
  assert.match(app, /\/\?prompt=\$\{encodeURIComponent\(limitedPrompt\)\}/);
  assert.doesNotMatch(app, /usePrompt[\s\S]{0,500}onGenerationCreated/);
  assert.match(pages, /example\.prompt\.length <= 800/);
  assert.match(pages, /Curated example · Not independently tested on Qwen Image 3/);
  assert.match(pages, /does not auto-submit/);
});

test("draft preview rendering requires the Worker-injected noindex marker", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /meta\[name="qwen-draft-preview"\]\[content="enabled"\]/);
  assert.doesNotMatch(app, /localhost|127\.0\.0\.1/);
});

test("homepage FAQ reaches 15 entries and the prompt page stays truth-safe until testing exists", () => {
  assert.equal(homeFaqs.length, 15);
  const promptDocument = contentDocumentForPath("/guides/best-prompts-for-qwen-image-3");
  assert.ok(promptDocument);
  assert.match(promptDocument.title, /Curated Examples/);
  assert.doesNotMatch(promptDocument.title, /Tested/);
  assert.match(promptDocument.faqs[0].answer, /have not completed a 50-result/);
});
