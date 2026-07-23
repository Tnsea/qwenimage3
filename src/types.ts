export type AspectRatio = "1:1" | "3:2" | "16:9" | "4:3" | "9:16";
export type ImageStyle = "Photorealistic" | "Editorial" | "Cinematic" | "Illustration";
export type ImageQuality = "Standard" | "High" | "Ultra";
export type GenerationQueueTier = "free" | "vip";

export interface Generation {
  id: string;
  prompt: string;
  aspectRatio: AspectRatio;
  style: ImageStyle;
  quality: ImageQuality;
  status: "processing" | "complete" | "failed";
  width: number;
  height: number;
  imageUrl: string | null;
  downloadUrl: string | null;
  provider: string;
  model: string;
  creditCost: number;
  queueTier: GenerationQueueTier;
  queuedAt: string;
  processingStartedAt: string | null;
  favorite: boolean;
  projectId: string | null;
  createdAt: string;
}

export interface GenerationRequest {
  prompt: string;
  modelId?: string;
  aspectRatio: AspectRatio;
  style: ImageStyle;
  quality: ImageQuality;
  projectId?: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface Entitlements {
  accountType: "guest" | "free" | "creator";
  guestLimit: number;
  guestRemaining: number;
  credits: number;
  reservedCredits: number;
  guestResetsAt: string;
  priorityGeneration: boolean;
  watermarkedExports: boolean;
}

export interface SessionState {
  user: User | null;
  entitlements: Entitlements;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  generationCount: number;
  archived: boolean;
  createdAt: string;
}

export interface CreditEntry {
  id: string;
  type: "signup_grant" | "purchase_grant" | "subscription_grant" | "generation_reservation" | "generation_settlement" | "generation_refund" | "manual_adjustment";
  amount: number;
  balanceAfter: number;
  referenceId: string | null;
  description: string;
  createdAt: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  scopes: string[];
  createdAt: string;
}

export interface ApiRequestLog {
  id: string;
  userId: string | null;
  apiKeyId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKeySummary {
  secret: string;
}

export interface AccountSession {
  id: string;
  userAgent: string;
  ipHint: string;
  current: boolean;
  lastSeenAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthMethods {
  password: true;
  google: boolean;
  github: boolean;
}

export type BillingPlanTier = "starter" | "creator" | "professional";
export type BillingInterval = "month" | "year";
export type BillingOfferId =
  | "starter_monthly"
  | "starter_yearly"
  | "creator_intro"
  | "creator_monthly"
  | "creator_yearly"
  | "professional_monthly"
  | "professional_yearly"
  | "credits_100"
  | "credits_300"
  | "credits_400"
  | "credits_1200"
  | "credits_3000";

export interface BillingOffer {
  id: BillingOfferId;
  name: string;
  description: string;
  priceLabel: string;
  amountCents: number;
  currency: "usd";
  credits: number;
  kind: "subscription" | "credits";
  configured: boolean;
  features: string[];
  planTier?: BillingPlanTier;
  billingInterval?: BillingInterval;
  monthlyEquivalentCredits?: number;
  standardImages?: number;
}

export interface PricingPromotion {
  offerId: "creator_intro";
  standardOfferId: "creator_monthly";
  startsAt: string;
  expiresAt: string;
  active: boolean;
  redeemed: boolean;
  standardAmountCents: number;
  promotionalAmountCents: number;
  currency: "usd";
}

export interface CatalogPlan {
  id: BillingPlanTier;
  name: string;
  price: string;
  description: string;
  features: string[];
  monthlyAmountCents: number;
  yearlyAmountCents: number;
  monthlyCredits: number;
  yearlyCredits: number;
  monthlyConfigured: boolean;
  yearlyConfigured: boolean;
  recommended?: boolean;
  valuePick?: boolean;
  planned?: boolean;
}

export interface CatalogPrompt {
  id: string;
  category: string;
  title: string;
  prompt: string;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: "local-preview" | "alibaba-model-studio" | "unassigned";
  available: boolean;
  status: string;
  speed: string;
  cost: string;
  bestFor: string;
}

export interface Catalog {
  plans: CatalogPlan[];
  prompts: CatalogPrompt[];
  models: CatalogModel[];
  promotion: PricingPromotion | null;
  creditPacks: BillingOffer[];
}

export interface BillingSummary {
  configured: boolean;
  promotion: PricingPromotion | null;
  account: {
    plan: "free" | "creator";
    planTier?: "free" | BillingPlanTier;
    billingInterval?: BillingInterval | null;
    status: "inactive" | "active" | "trialing" | "past_due" | "canceled";
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasCustomer: boolean;
    spendingBlocked: boolean;
    blockReason: string | null;
  };
  offers: BillingOffer[];
  orders: Array<{
    id: string;
    offerId: string;
    kind: "subscription" | "credits";
    credits: number;
    amountCents: number;
    currency: string;
    status: "pending" | "paid" | "expired";
    financialStatus: "normal" | "refunded" | "disputed";
    createdAt: string;
    completedAt: string | null;
  }>;
}

export type SupportTicketCategory = "generation" | "billing" | "api" | "account" | "other";
export type SupportTicketPriority = "normal" | "high";
export type SupportTicketStatus = "open" | "waiting" | "resolved" | "closed";

export interface SupportMessage {
  id: string;
  ticketId: string;
  author: "user" | "support";
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[];
}

export type WorkspaceActivityType = "generation" | "credit" | "payment" | "support";

export interface WorkspaceActivity {
  id: string;
  type: WorkspaceActivityType;
  title: string;
  detail: string;
  status: string;
  href: string;
  createdAt: string;
}

export interface WorkspaceOverview {
  plan: {
    name: "Free" | "Account" | "Starter" | "Creator" | "Professional";
    status: BillingSummary["account"]["status"];
  };
  credits: {
    available: number;
    reserved: number;
  };
  usage: {
    generationsThisMonth: number;
    generationsAllTime: number;
  };
  activeProjects: number;
  activeApiKeys: number;
  openSupportTickets: number;
  recentActivity: WorkspaceActivity[];
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
