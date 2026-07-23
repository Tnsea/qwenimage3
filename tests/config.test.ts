import assert from "node:assert/strict";
import test from "node:test";
import { productionConfigurationErrors } from "../server/config.js";

test("production startup rejects development providers and unsafe cookies", () => {
  const errors = productionConfigurationErrors({
    NODE_ENV: "production", APP_BASE_URL: "http://example.com", COOKIE_SECURE: "false", ALLOW_DEV_AUTH_TOKENS: "true",
    DATABASE_PATH: ":memory:", EMAIL_PROVIDER: "console", GENERATION_PROVIDER: "local",
  });
  assert.ok(errors.some((error) => error.includes("HTTPS")));
  assert.ok(errors.some((error) => error.includes("COOKIE_SECURE")));
  assert.ok(errors.some((error) => error.includes("Production email")));
  assert.ok(errors.some((error) => error.includes("Production generation")));
});

test("production startup accepts a complete non-billing configuration", () => {
  const errors = productionConfigurationErrors({
    NODE_ENV: "production", APP_BASE_URL: "https://images.example.com", DATABASE_PATH: "/data/qwen.db",
    EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "hello@example.com",
    GENERATION_PROVIDER: "qwen", DASHSCOPE_API_KEY: "provider-test", QWEN_API_BASE_URL: "https://provider.example.com/api/v1",
    QWEN_IMAGE_ALLOWED_HOSTS: "aliyuncs.com", BILLING_ENABLED: "false",
  });
  assert.deepEqual(errors, []);
});

test("billing configuration requires both Creator prices and every credit-pack price", () => {
  const errors = productionConfigurationErrors({
    NODE_ENV: "production", APP_BASE_URL: "https://images.example.com", DATABASE_PATH: "/data/qwen.db",
    EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_test", EMAIL_FROM: "hello@example.com",
    GENERATION_PROVIDER: "qwen", DASHSCOPE_API_KEY: "provider-test", QWEN_API_BASE_URL: "https://provider.example.com/api/v1",
    QWEN_IMAGE_ALLOWED_HOSTS: "aliyuncs.com", BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_live_test", STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_CREATOR_MONTHLY: "price_standard", STRIPE_PRICE_CREDITS_100: "price_100", STRIPE_PRICE_CREDITS_300: "price_300",
  });
  assert.ok(errors.some((error) => error.includes("STRIPE_PRICE_CREATOR_INTRO")));
});
