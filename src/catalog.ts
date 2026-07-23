import type { BillingOffer, Catalog, CatalogModel, CatalogPlan, CatalogPrompt, PricingPromotion } from "./types.js";

export interface CatalogRuntime {
  providerId: "local-preview" | "alibaba-model-studio";
  providerModel: string;
  providerConfigured: boolean;
  creatorPriceLabel: string;
  creatorCredits: number;
  creatorPlanned: boolean;
}

export function createCatalogCore(runtime: CatalogRuntime): Pick<Catalog, "plans" | "prompts" | "models"> {
  const plans: CatalogPlan[] = [
    {
      id: "guest",
      name: "Guest",
      price: "$0",
      description: "Try the provider-aware image creation workflow",
      features: ["3 generations per day", "Standard free queue", "Watermarked exports", "24-hour local history"],
    },
    {
      id: "free",
      name: "Free account",
      price: "$0",
      description: "Keep your private image work and explore Studio",
      features: ["20 welcome credits", "Standard free queue", "Watermarked exports", "Projects, favorites, and API keys"],
    },
    {
      id: "creator",
      name: "Creator VIP",
      price: runtime.creatorPriceLabel,
      description: "For priority image workflow production",
      features: [
        `${runtime.creatorCredits} monthly credits`,
        "VIP priority generation",
        "Original exports without watermark",
        "Projects, favorites, API keys, and ledger",
        "Automatic credit recovery after failures",
      ],
      planned: runtime.creatorPlanned,
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

  const models: CatalogModel[] = [
    {
      id: "local-preview",
      name: "Local Development Preview",
      status: runtime.providerId === "local-preview" ? "Available" : "Development fallback",
      speed: "< 1 sec",
      cost: "Free guest / 1–4 credits",
      bestFor: "Layout, prompt iteration, local development",
    },
    {
      id: runtime.providerId === "alibaba-model-studio" ? runtime.providerModel : "qwen-image-2.0-pro",
      name: "Qwen Image 2.0 Pro",
      status: runtime.providerId === "alibaba-model-studio" && runtime.providerConfigured ? "Available" : "Configuration required",
      speed: "Provider dependent",
      cost: "1–4 product credits",
      bestFor: "Production image generation through Alibaba Cloud Model Studio",
    },
  ];

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
    && ["guest", "free", "creator"].includes(String(value.id))
    && typeof value.name === "string"
    && typeof value.price === "string"
    && typeof value.description === "string"
    && isStringArray(value.features)
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
    && typeof value.status === "string"
    && typeof value.speed === "string"
    && typeof value.cost === "string"
    && typeof value.bestFor === "string";
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
