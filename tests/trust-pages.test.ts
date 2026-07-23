import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("footer trust links resolve to dedicated public pages", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../src/components/SiteFooter.tsx", import.meta.url), "utf8");

  assert.match(footer, /\["Privacy & data", "\/privacy"\]/);
  assert.match(footer, /\["Billing terms", "\/terms"\]/);
  assert.match(footer, /\["Refund policy", "\/refund-policy"\]/);
  assert.match(footer, /\["Independent status", "\/status"\]/);
  assert.match(footer, /\["Contact support", "\/support"\]/);
  assert.doesNotMatch(footer, /\/#faq-(?:privacy|independent-product)/);

  assert.match(app, /path === "\/privacy"/);
  assert.match(app, /<PrivacyDataPage onNavigate=\{navigate\}/);
  assert.match(app, /path === "\/status"/);
  assert.match(app, /<IndependentStatusPage onNavigate=\{navigate\}/);
  assert.match(app, /path === "\/support"/);
  assert.match(app, /<SupportPage onNavigate=\{navigate\}/);
});

test("public trust pages preserve the pre-release and secret-handling boundaries", () => {
  const pages = readFileSync(new URL("../src/components/TrustPages.tsx", import.meta.url), "utf8");

  assert.match(pages, /export function PrivacyDataPage/);
  assert.match(pages, /Launch-region privacy, residency, age-limit, and legal-basis review is still pending/);
  assert.match(pages, /Generations are private by default/);
  assert.match(pages, /No universal public retention period is claimed yet/);
  assert.match(pages, /export function IndependentStatusPage/);
  assert.match(pages, /It is not an externally accepted production service/);
  assert.match(pages, /No Qwen Image 3 provider integration has been verified/);
  assert.match(pages, /One paid Kie\.ai Qwen Image 2 Worker task has completed successfully/);
  assert.doesNotMatch(pages, />Real Qwen execution,/);
  assert.match(pages, /export function SupportPage/);
  assert.match(pages, /Do not submit passwords, complete API keys, raw session tokens/);
  assert.match(pages, /onNavigate\("\/studio\/support"\)/);
});
