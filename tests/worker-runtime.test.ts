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

test("Cloudflare billing requires the sales gate and credentials while offers configure independently", () => {
  const credentialsOnly = {
    BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
  };
  assert.equal(billingConfigured(credentialsOnly), true);
  assert.ok(allOffers(credentialsOnly).every((offer) => offer.configured === false));

  const partial = { ...credentialsOnly, STRIPE_PRICE_CREATOR_YEARLY: "price_creator_yearly" };
  assert.equal(allOffers(partial).find((offer) => offer.id === "creator_yearly")?.configured, true);
  assert.equal(allOffers(partial).find((offer) => offer.id === "starter_yearly")?.configured, false);
  assert.deepEqual(allOffers(partial).map((offer) => offer.amountCents), [990, 9900, 2990, 29900, 5990, 59900, 1200, 3000, 6000]);

  const salesPaused = { ...partial, BILLING_ENABLED: "false" };
  assert.equal(billingConfigured(salesPaused), false);
  assert.equal(billingCredentialsConfigured(salesPaused), true);
  assert.equal(stripeAccessConfigured(salesPaused), true);
  assert.equal(stripeWebhookConfigured(salesPaused), true);
  assert.ok(allOffers(salesPaused).every((offer) => offer.configured === false));
});
