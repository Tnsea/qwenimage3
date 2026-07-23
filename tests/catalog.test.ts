import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogCore, parseCatalog } from "../src/catalog.js";
import type { BillingOffer, PricingPromotion } from "../src/types.js";

const creditPacks: BillingOffer[] = [
  {
    id: "credits_400",
    name: "400-credit pack",
    description: "A one-time top-up.",
    priceLabel: "$12 one time",
    amountCents: 1200,
    currency: "usd",
    credits: 400,
    kind: "credits",
    configured: false,
    standardImages: 100,
    features: ["400 credits"],
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

  assert.deepEqual(catalog.plans.map((plan) => plan.id), ["starter", "creator", "professional"]);
  assert.equal(catalog.plans.some((plan) => plan.name === "Guest"), false);
  assert.ok(catalog.plans.every((plan) => plan.features.length > 0));
  assert.deepEqual(catalog.plans.map((plan) => plan.monthlyAmountCents), [990, 2990, 5990]);
  assert.deepEqual(catalog.plans.map((plan) => plan.yearlyAmountCents), [9900, 29900, 59900]);
  assert.deepEqual(catalog.plans.map((plan) => plan.monthlyCredits), [500, 2000, 5000]);
  assert.deepEqual(catalog.plans.map((plan) => plan.yearlyCredits), [6000, 24000, 60000]);
  assert.ok(catalog.prompts.every((prompt) => prompt.id && prompt.category && prompt.title && prompt.prompt));
  assert.ok(catalog.models.every((model) => model.id
    && model.provider
    && typeof model.available === "boolean"
    && model.status
    && model.speed
    && model.cost
    && model.bestFor
    && Array.isArray(model.supportedAspectRatios)
    && Array.isArray(model.supportedQualities)
    && Number.isSafeInteger(model.maxPromptLength)));
  assert.deepEqual(catalog.models.filter((model) => model.available).map((model) => model.id), ["local-qwen-preview"]);
  assert.equal(catalog.models.find((model) => model.id === "qwen-image-3")?.available, false);
  assert.equal(catalog.models.find((model) => model.id === "qwen-image-3")?.provider, "unassigned");
});

test("catalog exposes only the configured provider model as selectable", () => {
  const core = createCatalogCore({
    providerId: "alibaba-model-studio",
    providerModel: "qwen-image-2.0-pro",
    providerConfigured: true,
    creatorPriceLabel: "$10 / month",
    creatorCredits: 300,
    creatorPlanned: true,
  });

  assert.deepEqual(core.models.filter((model) => model.available).map((model) => model.id), ["qwen-image-2.0-pro"]);
  assert.equal(core.models.find((model) => model.id === "local-qwen-preview")?.available, false);
});

test("catalog exposes the configured Kie.ai Qwen2 model as selectable", () => {
  const core = createCatalogCore({
    providerId: "kie-ai",
    providerModel: "qwen2/text-to-image",
    providerConfigured: true,
    creatorPriceLabel: "$10 / month",
    creatorCredits: 300,
    creatorPlanned: true,
  });

  assert.deepEqual(core.models.filter((model) => model.available).map((model) => model.id), ["qwen2/text-to-image"]);
  const kie = core.models.find((model) => model.id === "qwen2/text-to-image");
  assert.equal(kie?.provider, "kie-ai");
  assert.deepEqual(kie?.supportedAspectRatios, ["1:1", "16:9", "4:3", "9:16"]);
  assert.deepEqual(kie?.supportedQualities, ["Standard"]);
  assert.equal(kie?.maxPromptLength, 800);
  assert.equal(core.models.find((model) => model.id === "qwen-image-2.0-pro")?.available, false);
});

test("catalog never promotes an unsupported Qwen model override", () => {
  const core = createCatalogCore({
    providerId: "alibaba-model-studio",
    providerModel: "qwen-image-3",
    providerConfigured: true,
    creatorPriceLabel: "$10 / month",
    creatorCredits: 300,
    creatorPlanned: true,
  });

  assert.equal(core.models.some((model) => model.available), false);
  assert.equal(core.models.filter((model) => model.id === "qwen-image-3").length, 1);
  assert.equal(core.models.find((model) => model.id === "qwen-image-2.0-pro")?.status, "Unsupported model configuration");
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
