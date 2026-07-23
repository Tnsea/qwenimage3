import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogCore, parseCatalog } from "../src/catalog.js";
import type { BillingOffer, PricingPromotion } from "../src/types.js";

const creditPacks: BillingOffer[] = [
  {
    id: "credits_100",
    name: "100-credit pack",
    description: "A one-time top-up.",
    priceLabel: "$7 one time",
    amountCents: 700,
    currency: "usd",
    credits: 100,
    kind: "credits",
    configured: false,
    features: ["100 credits"],
  },
];

const promotion: PricingPromotion = {
  offerId: "creator_intro",
  standardOfferId: "creator_monthly",
  startsAt: "2026-07-23T00:00:00.000Z",
  expiresAt: "2026-07-23T00:10:00.000Z",
  active: true,
  redeemed: false,
  standardAmountCents: 1000,
  promotionalAmountCents: 800,
  currency: "usd",
};

test("shared catalog core matches the browser contract", () => {
  const core = createCatalogCore({
    providerId: "local-preview",
    providerModel: "local-qwen-preview",
    providerConfigured: true,
    creatorPriceLabel: "$10 / month",
    creatorCredits: 300,
    creatorPlanned: true,
  });
  const catalog = parseCatalog({ ...core, promotion, creditPacks });

  assert.deepEqual(catalog.plans.map((plan) => plan.id), ["guest", "free", "creator"]);
  assert.ok(catalog.plans.every((plan) => plan.features.length > 0));
  assert.ok(catalog.prompts.every((prompt) => prompt.id && prompt.category && prompt.title && prompt.prompt));
  assert.ok(catalog.models.every((model) => model.id && model.status && model.speed && model.cost && model.bestFor));
});

test("catalog parser rejects the former Cloudflare response shape", () => {
  assert.throws(() => parseCatalog({
    promotion,
    creditPacks,
    plans: [{ name: "Guest", benefits: ["3 generations"] }],
    prompts: ["A prompt"],
    models: [{ name: "Qwen Image 3.0", state: "Integration in progress" }],
  }), /catalog response is invalid/);
});
