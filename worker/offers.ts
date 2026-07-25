import type { BillingOffer } from "../src/types.js";

export const activeBillingOfferIds = [
  "starter_monthly",
  "starter_yearly",
  "creator_monthly",
  "creator_yearly",
  "professional_monthly",
  "professional_yearly",
  "credits_400",
  "credits_1200",
  "credits_3000",
] as const satisfies readonly BillingOffer["id"][];

export type ActiveBillingOfferId = typeof activeBillingOfferIds[number];

export interface BillingEnvironment {
  BILLING_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_STARTER_MONTHLY?: string;
  STRIPE_PRICE_STARTER_YEARLY?: string;
  STRIPE_PRICE_CREATOR_MONTHLY?: string;
  STRIPE_PRICE_CREATOR_YEARLY?: string;
  STRIPE_PRICE_PROFESSIONAL_MONTHLY?: string;
  STRIPE_PRICE_PROFESSIONAL_YEARLY?: string;
  STRIPE_PRICE_CREDITS_400?: string;
  STRIPE_PRICE_CREDITS_1200?: string;
  STRIPE_PRICE_CREDITS_3000?: string;
}

export function billingEnabled(env: BillingEnvironment) {
  return env.BILLING_ENABLED?.trim().toLowerCase() === "true";
}

export function stripeAccessConfigured(env: BillingEnvironment) {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

export function stripeWebhookConfigured(env: BillingEnvironment) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function billingCredentialsConfigured(env: BillingEnvironment) {
  return stripeAccessConfigured(env) && stripeWebhookConfigured(env);
}

export function billingConfigured(env: BillingEnvironment) {
  return billingEnabled(env) && billingCredentialsConfigured(env);
}

export function priceIdFor(env: BillingEnvironment, offerId: BillingOffer["id"]) {
  const priceIds: Partial<Record<BillingOffer["id"], string | undefined>> = {
    starter_monthly: env.STRIPE_PRICE_STARTER_MONTHLY,
    starter_yearly: env.STRIPE_PRICE_STARTER_YEARLY,
    creator_monthly: env.STRIPE_PRICE_CREATOR_MONTHLY,
    creator_yearly: env.STRIPE_PRICE_CREATOR_YEARLY,
    professional_monthly: env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
    professional_yearly: env.STRIPE_PRICE_PROFESSIONAL_YEARLY,
    credits_400: env.STRIPE_PRICE_CREDITS_400,
    credits_1200: env.STRIPE_PRICE_CREDITS_1200,
    credits_3000: env.STRIPE_PRICE_CREDITS_3000,
  };
  return priceIds[offerId]?.trim() || "";
}

export function allOffers(env: BillingEnvironment): BillingOffer[] {
  const configured = (offerId: ActiveBillingOfferId) => billingConfigured(env) && Boolean(priceIdFor(env, offerId));
  const accountFeatures = [
    "Private account generations",
    "Original exports without a watermark",
    "Projects, favorites, API keys, and ledger",
    "Credits restored automatically after failed jobs",
  ];
  return [
    {
      id: "starter_monthly",
      name: "Starter monthly",
      description: "A practical entry plan for an account-based image workflow.",
      priceLabel: "$9.90 / month",
      amountCents: 990,
      currency: "usd",
      credits: 500,
      kind: "subscription",
      configured: configured("starter_monthly"),
      planTier: "starter",
      billingInterval: "month",
      monthlyEquivalentCredits: 500,
      standardImages: 125,
      features: ["500 credits each month", "Up to 125 Standard images per month", ...accountFeatures],
    },
    {
      id: "starter_yearly",
      name: "Starter yearly",
      description: "Two months free, with the full annual credit allowance granted after the yearly invoice is paid.",
      priceLabel: "$99 / year",
      amountCents: 9900,
      currency: "usd",
      credits: 6000,
      kind: "subscription",
      configured: configured("starter_yearly"),
      planTier: "starter",
      billingInterval: "year",
      monthlyEquivalentCredits: 500,
      standardImages: 1500,
      features: ["6,000 credits granted annually", "Up to 1,500 Standard images per year", "Two months free", ...accountFeatures],
    },
    {
      id: "creator_monthly",
      name: "Creator monthly",
      description: "More recurring capacity and priority processing for consistent creators.",
      priceLabel: "$29.90 / month",
      amountCents: 2990,
      currency: "usd",
      credits: 2000,
      kind: "subscription",
      configured: configured("creator_monthly"),
      planTier: "creator",
      billingInterval: "month",
      monthlyEquivalentCredits: 2000,
      standardImages: 500,
      features: ["2,000 credits each month", "Up to 500 Standard images per month", "VIP priority generation", ...accountFeatures],
    },
    {
      id: "creator_yearly",
      name: "Creator yearly",
      description: "The recommended creator plan, billed once with the full annual credit allowance.",
      priceLabel: "$299 / year",
      amountCents: 29900,
      currency: "usd",
      credits: 24000,
      kind: "subscription",
      configured: configured("creator_yearly"),
      planTier: "creator",
      billingInterval: "year",
      monthlyEquivalentCredits: 2000,
      standardImages: 6000,
      features: ["24,000 credits granted annually", "Up to 6,000 Standard images per year", "Two months free", "VIP priority generation", ...accountFeatures],
    },
    {
      id: "professional_monthly",
      name: "Professional monthly",
      description: "High-volume capacity with the lowest subscription cost per credit.",
      priceLabel: "$59.90 / month",
      amountCents: 5990,
      currency: "usd",
      credits: 5000,
      kind: "subscription",
      configured: configured("professional_monthly"),
      planTier: "professional",
      billingInterval: "month",
      monthlyEquivalentCredits: 5000,
      standardImages: 1250,
      features: ["5,000 credits each month", "Up to 1,250 Standard images per month", "VIP priority generation", "Lowest subscription cost per credit", ...accountFeatures],
    },
    {
      id: "professional_yearly",
      name: "Professional yearly",
      description: "Maximum annual capacity, billed once with the full annual credit allowance.",
      priceLabel: "$599 / year",
      amountCents: 59900,
      currency: "usd",
      credits: 60000,
      kind: "subscription",
      configured: configured("professional_yearly"),
      planTier: "professional",
      billingInterval: "year",
      monthlyEquivalentCredits: 5000,
      standardImages: 15000,
      features: ["60,000 credits granted annually", "Up to 15,000 Standard images per year", "Two months free", "VIP priority generation", "Lowest subscription cost per credit", ...accountFeatures],
    },
    {
      id: "credits_400",
      name: "400-credit pack",
      description: "A small one-time top-up for occasional production runs.",
      priceLabel: "$12 one time",
      amountCents: 1200,
      currency: "usd",
      credits: 400,
      kind: "credits",
      configured: configured("credits_400"),
      standardImages: 100,
      features: ["Up to 100 Standard images", "Works in the web app and API", "No recurring payment", "Credits remain until used"],
    },
    {
      id: "credits_1200",
      name: "1,200-credit pack",
      description: "A balanced top-up for project-based work without a subscription.",
      priceLabel: "$30 one time",
      amountCents: 3000,
      currency: "usd",
      credits: 1200,
      kind: "credits",
      configured: configured("credits_1200"),
      standardImages: 300,
      features: ["Up to 300 Standard images", "Works in the web app and API", "No recurring payment", "Credits remain until used"],
    },
    {
      id: "credits_3000",
      name: "3,000-credit pack",
      description: "The lowest one-time cost per credit for larger production runs.",
      priceLabel: "$60 one time",
      amountCents: 6000,
      currency: "usd",
      credits: 3000,
      kind: "credits",
      configured: configured("credits_3000"),
      standardImages: 750,
      features: ["Up to 750 Standard images", "Works in the web app and API", "No recurring payment", "Credits remain until used"],
    },
  ];
}
