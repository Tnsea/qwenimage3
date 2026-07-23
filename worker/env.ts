import type { BillingEnvironment } from "./offers.js";

export interface Env extends BillingEnvironment {
  DB: D1Database;
  ASSETS_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  APP_BASE_URL: string;
  DEPLOY_REVISION?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  EXTERNAL_HTTP_TIMEOUT_MS?: string;
  STRIPE_TIMEOUT_MS?: string;
  BILLING_OPERATOR_TOKEN?: string;
  OPS_ALERT_EMAIL?: SendEmail;
  OPS_ALERT_TO?: string;
  OPS_ALERT_FROM?: string;
  GENERATION_PROVIDER?: string;
  QWEN_MODEL_ID?: string;
  QWEN_API_BASE_URL?: string;
  QWEN_API_ALLOWED_HOST?: string;
  DASHSCOPE_API_KEY?: string;
  QWEN_IMAGE_ALLOWED_HOSTS?: string;
  FREE_QUEUE_DELAY_MS?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}
