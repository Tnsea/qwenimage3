import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GA4 is consent-gated, excludes advertising signals, and tracks SPA page views", async () => {
  const [analytics, consent, app, footer, marketing] = await Promise.all([
    readFile("src/analytics.ts", "utf8"),
    readFile("src/components/AnalyticsConsent.tsx", "utf8"),
    readFile("src/App.tsx", "utf8"),
    readFile("src/components/SiteFooter.tsx", "utf8"),
    readFile("src/components/Marketing.tsx", "utf8"),
  ]);

  assert.match(analytics, /G-7Q6BB5CR23/);
  assert.match(analytics, /readAnalyticsConsent\(\) !== "granted"/);
  assert.match(analytics, /ad_storage: "denied"/);
  assert.match(analytics, /ad_user_data: "denied"/);
  assert.match(analytics, /ad_personalization: "denied"/);
  assert.match(analytics, /allow_google_signals: false/);
  assert.match(analytics, /allow_ad_personalization_signals: false/);
  assert.match(analytics, /send_page_view: false/);
  assert.match(analytics, /"event", "page_view"/);
  assert.match(consent, /Prompts, generated images, and account identifiers are not sent/);
  assert.match(app, /trackPageView\(path\)/);
  assert.match(footer, /Analytics choices/);
  assert.match(marketing, /GA4 remains off unless you allow optional analytics/);
});
