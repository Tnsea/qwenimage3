import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GA4 loads by default, excludes advertising signals, and tracks SPA page views", async () => {
  const [analytics, app, footer, marketing] = await Promise.all([
    readFile("src/analytics.ts", "utf8"),
    readFile("src/App.tsx", "utf8"),
    readFile("src/components/SiteFooter.tsx", "utf8"),
    readFile("src/components/Marketing.tsx", "utf8"),
  ]);

  assert.match(analytics, /G-7Q6BB5CR23/);
  assert.match(analytics, /initializeAnalytics/);
  assert.doesNotMatch(analytics, /localStorage|readAnalyticsConsent|setAnalyticsConsent/);
  assert.match(analytics, /analytics_storage: "granted"/);
  assert.match(analytics, /ad_storage: "denied"/);
  assert.match(analytics, /ad_user_data: "denied"/);
  assert.match(analytics, /ad_personalization: "denied"/);
  assert.match(analytics, /allow_google_signals: false/);
  assert.match(analytics, /allow_ad_personalization_signals: false/);
  assert.match(analytics, /send_page_view: false/);
  assert.match(analytics, /"event", "page_view"/);
  assert.match(app, /initializeAnalytics\(\)/);
  assert.match(app, /trackPageView\(path\)/);
  assert.doesNotMatch(app, /AnalyticsConsent/);
  assert.doesNotMatch(footer, /Analytics choices/);
  assert.match(marketing, /GA4 measures page visits when the site loads/);
  assert.match(marketing, /prompts, generated images, and account identifiers are not sent/);
});
