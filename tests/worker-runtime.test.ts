import assert from "node:assert/strict";
import test from "node:test";
import { allOffers, billingConfigured, billingCredentialsConfigured, stripeAccessConfigured, stripeWebhookConfigured } from "../worker/offers.js";
import { createToken, hashPassword, hashToken, verifyPassword } from "../worker/security.js";

test("Cloudflare password and token hashing is salted, verifiable, and one-way", async () => {
  const password = "Acceptance12345";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.match(first, /^pbkdf2-sha256\$100000\$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);

  const token = createToken();
  assert.ok(token.length >= 40);
  assert.notEqual(await hashToken(token), token);
});

test("Cloudflare billing remains fail-closed until every Stripe Price is configured", () => {
  const incomplete = {
    BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_CREATOR_INTRO: "price_intro",
    STRIPE_PRICE_CREATOR_MONTHLY: "price_standard",
    STRIPE_PRICE_CREDITS_100: "price_pack_100",
  };
  assert.equal(billingConfigured(incomplete), false);
  assert.equal(allOffers(incomplete).find((offer) => offer.id === "credits_300")?.configured, false);

  const complete = { ...incomplete, STRIPE_PRICE_CREDITS_300: "price_pack_300" };
  assert.equal(billingConfigured(complete), true);
  assert.deepEqual(allOffers(complete).map((offer) => offer.amountCents), [800, 1000, 700, 1800]);

  const salesPaused = { ...complete, BILLING_ENABLED: "false" };
  assert.equal(billingConfigured(salesPaused), false);
  assert.equal(billingCredentialsConfigured(salesPaused), true);
  assert.equal(stripeAccessConfigured(salesPaused), true);
  assert.equal(stripeWebhookConfigured(salesPaused), true);
  assert.ok(allOffers(salesPaused).every((offer) => offer.configured === false));
});
