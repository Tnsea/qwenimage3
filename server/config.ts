export function productionConfigurationErrors(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return [];
  const errors: string[] = [];
  let appUrl: URL | null = null;
  try { appUrl = new URL(env.APP_BASE_URL ?? ""); } catch { errors.push("APP_BASE_URL must be an absolute URL."); }
  if (appUrl && appUrl.protocol !== "https:") errors.push("APP_BASE_URL must use HTTPS in production.");
  if (env.COOKIE_SECURE === "false") errors.push("COOKIE_SECURE=false is not allowed in production.");
  if (env.ALLOW_DEV_AUTH_TOKENS === "true") errors.push("ALLOW_DEV_AUTH_TOKENS=true is not allowed in production.");
  if (!env.DATABASE_PATH || env.DATABASE_PATH === ":memory:") errors.push("DATABASE_PATH must point to persistent storage.");

  if (env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
    errors.push("Production email requires EMAIL_PROVIDER=resend, RESEND_API_KEY, and EMAIL_FROM.");
  }
  if (env.GENERATION_PROVIDER !== "qwen" || !env.DASHSCOPE_API_KEY || !env.QWEN_API_BASE_URL) {
    errors.push("Production generation requires GENERATION_PROVIDER=qwen, DASHSCOPE_API_KEY, and QWEN_API_BASE_URL.");
  } else {
    try {
      if (new URL(env.QWEN_API_BASE_URL).protocol !== "https:") errors.push("QWEN_API_BASE_URL must use HTTPS.");
    } catch { errors.push("QWEN_API_BASE_URL must be an absolute URL."); }
  }
  if (!env.QWEN_IMAGE_ALLOWED_HOSTS?.trim()) errors.push("QWEN_IMAGE_ALLOWED_HOSTS must explicitly list trusted provider asset hosts.");

  if (env.BILLING_ENABLED === "true") {
    const required = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_CREATOR_INTRO", "STRIPE_PRICE_CREATOR_MONTHLY", "STRIPE_PRICE_CREDITS_100", "STRIPE_PRICE_CREDITS_300"];
    const missing = required.filter((name) => !env[name]?.trim());
    if (missing.length) errors.push(`Billing is enabled but missing: ${missing.join(", ")}.`);
  }
  return errors;
}

export function assertProductionConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const errors = productionConfigurationErrors(env);
  if (errors.length) throw new Error(`Unsafe production configuration:\n- ${errors.join("\n- ")}`);
}
