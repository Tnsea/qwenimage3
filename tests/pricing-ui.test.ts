import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("pricing defaults to yearly and exposes three account-based plans safely", () => {
  const marketing = readFileSync(new URL("../src/components/Marketing.tsx", import.meta.url), "utf8");
  const homeSections = marketing.slice(marketing.indexOf("export function HomeSections"), marketing.indexOf("function PageIntro"));
  const pricingPage = marketing.slice(marketing.indexOf("export function PricingPage"), marketing.indexOf("export function BillingTermsPage"));

  assert.match(marketing, /function PricingPlanGrid/);
  assert.match(marketing, /catalog\.plans\.map/);
  assert.match(marketing, /disabled=\{actionDisabled\}/);
  assert.match(marketing, /Checkout not enabled/);
  assert.match(homeSections, /useState<BillingPeriod>\("yearly"\)/);
  assert.match(homeSections, /aria-label="Homepage billing period"/);
  assert.match(homeSections, /<PricingPlanGrid/);
  assert.match(homeSections, /Three plans, one clear image allowance\./);
  assert.doesNotMatch(homeSections, /starterPlan|creatorPlan|plan-decision-grid/);
  assert.match(pricingPage, /useState<BillingPeriod>\("yearly"\)/);
  assert.match(pricingPage, /aria-label="Billing period"/);
  assert.match(pricingPage, /Save 2 months/);
  assert.match(pricingPage, /billingPeriod=\{billingPeriod\}/);
  assert.match(pricingPage, /disableUnavailable/);
  assert.match(pricingPage, /full annual credit allowance is issued after the yearly invoice is paid/);
  assert.match(pricingPage, /Standard uses 4 credits, High uses 8, and Ultra uses 16/);
  assert.match(marketing, /Most popular/);
  assert.match(marketing, /Best unit price/);
  assert.doesNotMatch(pricingPage, /Generate as guest|No account needed|Everything in Guest/);
  assert.match(pricingPage, /20 welcome credits/);
  assert.match(pricingPage, /Know the billing terms before you buy/);
  assert.match(pricingPage, /By selecting a paid plan or credit pack/);
  assert.match(pricingPage, /onCheckout/);
  assert.match(pricingPage, /startCheckout\(offer\.id\)/);
  assert.match(pricingPage, /Buy with Stripe/);
  assert.match(pricingPage, /href="\/terms"/);
  assert.match(pricingPage, /href="\/refund-policy"/);
});

test("pricing selection records policy acceptance and opens Stripe Checkout without a second purchase click", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(app, /qwen-pending-checkout-offer/);
  assert.match(app, /\/api\/billing\/terms\/accept/);
  assert.match(app, /\/api\/billing\/checkout/);
  assert.match(app, /window\.location\.assign\(payload\.url\)/);
  assert.match(app, /await createPricingCheckout\(offerId\)/);
  assert.match(app, /<PricingPage catalog=\{catalog\} onCheckout=\{startPricingCheckout\}/);
  assert.doesNotMatch(app, /session\.user \? navigate\("\/studio\/billing"\)/);
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
