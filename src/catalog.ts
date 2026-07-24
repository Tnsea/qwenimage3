import type { BillingOffer, Catalog, CatalogModel, CatalogPlan, CatalogPrompt, PricingPromotion } from "./types.js";

export const SUPPORTED_QWEN_MODEL_ID = "qwen-image-2.0-pro";
export const KIE_QWEN_MODEL_ID = "qwen2/text-to-image";
const productAspectRatios = ["1:1", "3:2", "16:9", "4:3", "9:16"] as const;
const productQualities = ["Standard", "High", "Ultra"] as const;

export interface CatalogRuntime {
  providerId: "local-preview" | "alibaba-model-studio" | "kie-ai";
  providerModel: string;
  providerConfigured: boolean;
  creatorPriceLabel: string;
  creatorCredits: number;
  creatorPlanned: boolean;
  pricingOffers?: BillingOffer[];
}

export type ModelCatalogRuntime = Pick<CatalogRuntime, "providerId" | "providerModel" | "providerConfigured">;

export function createModelCatalog(runtime: ModelCatalogRuntime): CatalogModel[] {
  const localAvailable = runtime.providerId === "local-preview";
  const qwenSelected = runtime.providerId === "alibaba-model-studio";
  const qwenModelSupported = runtime.providerModel === SUPPORTED_QWEN_MODEL_ID;
  const qwenAvailable = qwenSelected && qwenModelSupported && runtime.providerConfigured;
  const kieSelected = runtime.providerId === "kie-ai";
  const kieModelSupported = runtime.providerModel === KIE_QWEN_MODEL_ID;
  const kieAvailable = kieSelected && kieModelSupported && runtime.providerConfigured;
  const localModels: CatalogModel[] = localAvailable
    ? [{
        id: "local-qwen-preview",
        name: "Fast Preview",
        provider: "local-preview",
        available: true,
        status: "Available",
        speed: "< 1 sec",
        cost: "4–16 account credits",
        bestFor: "Fast composition and layout previews",
        supportedAspectRatios: [...productAspectRatios],
        supportedQualities: [...productQualities],
        maxPromptLength: 1000,
      }]
    : [];

  return [
    ...localModels,
    {
      id: SUPPORTED_QWEN_MODEL_ID,
      name: "Qwen Image 2.0 Pro",
      provider: "alibaba-model-studio",
      available: qwenAvailable,
      status: qwenAvailable ? "Available" : qwenSelected && !qwenModelSupported ? "Unsupported model configuration" : "Configuration required",
      speed: "Provider dependent",
      cost: "4–16 product credits",
      bestFor: "Provider-backed image generation through Alibaba Cloud Model Studio",
      supportedAspectRatios: [...productAspectRatios],
      supportedQualities: [...productQualities],
      maxPromptLength: 1000,
    },
    {
      id: KIE_QWEN_MODEL_ID,
      name: "Qwen Image 2",
      provider: "kie-ai",
      available: kieAvailable,
      status: kieAvailable ? "Available" : kieSelected && !kieModelSupported ? "Unsupported model configuration" : "Configuration required",
      speed: "Provider dependent",
      cost: "4 product credits",
      bestFor: "2K provider-backed image generation through Kie.ai",
      supportedAspectRatios: ["1:1", "16:9", "4:3", "9:16"],
      supportedQualities: ["Standard"],
      maxPromptLength: 800,
    },
    {
      id: "qwen-image-3",
      name: "Qwen Image 3",
      provider: "unassigned",
      available: false,
      status: "Integration in progress",
      speed: "Not available",
      cost: "Not available",
      bestFor: "Shown for roadmap transparency; generation is disabled",
      supportedAspectRatios: [],
      supportedQualities: [],
      maxPromptLength: 0,
    },
  ];
}

export function createCatalogCore(runtime: CatalogRuntime): Pick<Catalog, "plans" | "prompts" | "models"> {
  const offerConfigured = (offerId: BillingOffer["id"]) => Boolean(
    runtime.pricingOffers?.find((offer) => offer.id === offerId)?.configured,
  );
  const plans: CatalogPlan[] = [
    {
      id: "starter",
      name: "Starter",
      price: "$9.90 / month",
      description: "For exploring a dependable account-based image workflow.",
      monthlyAmountCents: 990,
      yearlyAmountCents: 9900,
      monthlyCredits: 500,
      yearlyCredits: 6000,
      monthlyConfigured: offerConfigured("starter_monthly"),
      yearlyConfigured: offerConfigured("starter_yearly"),
      features: [
        "Up to 125 Standard images per month",
        "Private account generations",
        "Original exports without a watermark",
        "Projects, favorites, API keys, and ledger",
        "Credits restored automatically after failed jobs",
      ],
    },
    {
      id: "creator",
      name: "Creator",
      price: "$29.90 / month",
      description: "For consistent creators who need more capacity and faster processing.",
      monthlyAmountCents: 2990,
      yearlyAmountCents: 29900,
      monthlyCredits: 2000,
      yearlyCredits: 24000,
      monthlyConfigured: offerConfigured("creator_monthly"),
      yearlyConfigured: offerConfigured("creator_yearly"),
      recommended: true,
      features: [
        "Up to 500 Standard images per month",
        "Everything in Starter",
        "VIP priority generation",
        "Original exports without watermark",
        "Projects, favorites, API keys, and ledger",
        "Automatic credit recovery after failures",
      ],
    },
    {
      id: "professional",
      name: "Professional",
      price: "$59.90 / month",
      description: "For high-volume production workflows with the lowest subscription cost per credit.",
      monthlyAmountCents: 5990,
      yearlyAmountCents: 59900,
      monthlyCredits: 5000,
      yearlyCredits: 60000,
      monthlyConfigured: offerConfigured("professional_monthly"),
      yearlyConfigured: offerConfigured("professional_yearly"),
      valuePick: true,
      features: [
        "Up to 1,250 Standard images per month",
        "Everything in Creator",
        "VIP priority generation",
        "Original exports without watermark",
        "Lowest subscription cost per credit",
      ],
    },
  ];

  const prompts: CatalogPrompt[] = [
    { id: "product", category: "Product", title: "Cobalt product hero", prompt: "A premium cobalt perfume bottle on black stone, soft studio light, precise reflections, editorial product photography" },
    { id: "travel", category: "Cinematic", title: "Rainy night train", prompt: "A tiny night train crossing a steel bridge in heavy rain, cinematic wide shot, deep blue atmosphere, warm carriage windows" },
    { id: "interior", category: "Interior", title: "Warm minimal workspace", prompt: "A minimalist workspace with warm oak, morning shadows, tactile paper details, calm editorial interior photography" },
    { id: "poster", category: "Poster", title: "Future type poster", prompt: "A restrained futuristic poster with monumental sans-serif typography, silver foil, black paper, controlled studio lighting" },
    { id: "food", category: "Food", title: "Summer tasting plate", prompt: "A refined summer tasting plate with heirloom tomatoes and basil oil, natural side light, tactile ceramic, editorial food photography" },
    { id: "fashion", category: "Fashion", title: "Architectural tailoring", prompt: "A model wearing sculptural ivory tailoring inside a concrete gallery, long directional shadows, quiet luxury fashion campaign" },
    { id: "landscape", category: "Landscape", title: "Volcanic coast at dusk", prompt: "A windswept volcanic coastline at blue hour, fine sea mist, distant warm lighthouse, cinematic large-format landscape photography" },
    { id: "architecture", category: "Architecture", title: "Desert research pavilion", prompt: "A low carbon research pavilion in the desert, rammed earth walls, deep shaded courtyards, precise architectural photography at sunrise" },
    { id: "character", category: "Character", title: "Botanical field researcher", prompt: "A botanical field researcher cataloging luminous alpine flowers, practical expedition clothing, documentary portrait, soft overcast light" },
    { id: "packaging", category: "Packaging", title: "Sustainable tea collection", prompt: "A premium sustainable tea packaging collection in moss green paper, blind embossing, ordered studio composition, soft diffused shadows" },
    { id: "editorial", category: "Editorial", title: "Floating paper city", prompt: "An editorial illustration of a city built from folded paper floating above clouds, restrained coral and cobalt palette, crisp graphic shadows" },
    { id: "automotive", category: "Automotive", title: "Electric coupe after rain", prompt: "A silver electric coupe parked beneath brutalist concrete after rain, wet reflections, low camera angle, cinematic automotive campaign" },
  ];

  const models = createModelCatalog(runtime);

  return { plans, prompts, models };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPlan(value: unknown): value is CatalogPlan {
  return isRecord(value)
    && ["starter", "creator", "professional"].includes(String(value.id))
    && typeof value.name === "string"
    && typeof value.price === "string"
    && typeof value.description === "string"
    && typeof value.monthlyAmountCents === "number"
    && typeof value.yearlyAmountCents === "number"
    && typeof value.monthlyCredits === "number"
    && typeof value.yearlyCredits === "number"
    && typeof value.monthlyConfigured === "boolean"
    && typeof value.yearlyConfigured === "boolean"
    && isStringArray(value.features)
    && (value.recommended === undefined || typeof value.recommended === "boolean")
    && (value.valuePick === undefined || typeof value.valuePick === "boolean")
    && (value.planned === undefined || typeof value.planned === "boolean");
}

function isPrompt(value: unknown): value is CatalogPrompt {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.category === "string"
    && typeof value.title === "string"
    && typeof value.prompt === "string";
}

function isModel(value: unknown): value is CatalogModel {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && ["local-preview", "alibaba-model-studio", "kie-ai", "unassigned"].includes(String(value.provider))
    && typeof value.available === "boolean"
    && typeof value.status === "string"
    && typeof value.speed === "string"
    && typeof value.cost === "string"
    && typeof value.bestFor === "string"
    && Array.isArray(value.supportedAspectRatios)
    && value.supportedAspectRatios.every((item) => productAspectRatios.includes(item as typeof productAspectRatios[number]))
    && Array.isArray(value.supportedQualities)
    && value.supportedQualities.every((item) => productQualities.includes(item as typeof productQualities[number]))
    && typeof value.maxPromptLength === "number"
    && Number.isSafeInteger(value.maxPromptLength)
    && value.maxPromptLength >= 0;
}

function isBillingOffer(value: unknown): value is BillingOffer {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.description === "string"
    && typeof value.priceLabel === "string"
    && typeof value.amountCents === "number"
    && typeof value.currency === "string"
    && typeof value.credits === "number"
    && typeof value.kind === "string"
    && typeof value.configured === "boolean"
    && (value.planTier === undefined || ["starter", "creator", "professional"].includes(String(value.planTier)))
    && (value.billingInterval === undefined || ["month", "year"].includes(String(value.billingInterval)))
    && (value.monthlyEquivalentCredits === undefined || typeof value.monthlyEquivalentCredits === "number")
    && (value.standardImages === undefined || typeof value.standardImages === "number")
    && isStringArray(value.features);
}

function isPromotion(value: unknown): value is PricingPromotion | null {
  return value === null || (
    isRecord(value)
    && value.offerId === "creator_intro"
    && value.standardOfferId === "creator_monthly"
    && typeof value.startsAt === "string"
    && typeof value.expiresAt === "string"
    && typeof value.active === "boolean"
    && typeof value.redeemed === "boolean"
    && typeof value.standardAmountCents === "number"
    && typeof value.promotionalAmountCents === "number"
    && value.currency === "usd"
  );
}

export function parseCatalog(value: unknown): Catalog {
  if (!isRecord(value)
    || !Array.isArray(value.plans) || !value.plans.every(isPlan)
    || !Array.isArray(value.prompts) || !value.prompts.every(isPrompt)
    || !Array.isArray(value.models) || !value.models.every(isModel)
    || !Array.isArray(value.creditPacks) || !value.creditPacks.every(isBillingOffer)
    || !isPromotion(value.promotion)) {
    throw new Error("The public catalog response is invalid.");
  }
  return value as unknown as Catalog;
}
