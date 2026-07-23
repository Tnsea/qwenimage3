import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("pricing defaults to yearly and exposes three account-based plans safely", () => {
  const marketing = readFileSync(new URL("../src/components/Marketing.tsx", import.meta.url), "utf8");
  const pricingPage = marketing.slice(marketing.indexOf("export function PricingPage"), marketing.indexOf("export function GuidesPage"));

  assert.match(pricingPage, /useState<"monthly" \| "yearly">\("yearly"\)/);
  assert.match(pricingPage, /aria-label="Billing period"/);
  assert.match(pricingPage, /Save 2 months/);
  assert.match(pricingPage, /data-billing-period=\{billingPeriod\}/);
  assert.match(pricingPage, /catalog\.plans\.map/);
  assert.match(pricingPage, /disabled=\{!configured\}/);
  assert.match(pricingPage, /full annual credit allowance is issued after the yearly invoice is paid/);
  assert.match(pricingPage, /Standard uses 4 credits, High uses 8, and Ultra uses 16/);
  assert.match(pricingPage, /Most popular/);
  assert.match(pricingPage, /Best unit price/);
  assert.doesNotMatch(pricingPage, /Generate as guest|No account needed|Everything in Guest/);
  assert.match(pricingPage, /20 welcome credits/);
  assert.match(pricingPage, /Know the billing terms before you buy/);
  assert.match(pricingPage, /href="\/terms"/);
  assert.match(pricingPage, /href="\/refund-policy"/);
});

test("Studio requires explicit current-version billing policy acceptance before Checkout", () => {
  const studio = readFileSync(new URL("../src/components/Studio.tsx", import.meta.url), "utf8");
  const policy = readFileSync(new URL("../src/billing-policy.ts", import.meta.url), "utf8");

  assert.match(studio, /Purchase confirmation/);
  assert.match(studio, /\/api\/billing\/terms\/accept/);
  assert.match(studio, /disabled=\{!offer\.configured \|\| !billingTermsConfirmed/);
  assert.match(studio, /automatic renewal and credit recovery after refunds or disputes/);
  assert.match(policy, /Subscriptions renew automatically/);
  assert.match(policy, /Contact Support within 7 days/);
  assert.match(policy, /non-waivable consumer rights/);
});
