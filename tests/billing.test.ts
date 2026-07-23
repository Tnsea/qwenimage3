import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test, { after } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "qwen-billing-"));
process.env.DATABASE_PATH = join(testDirectory, "billing.db");
process.env.COOKIE_SECURE = "false";
process.env.STRIPE_SECRET_KEY = "sk_test_product";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_product_test";
process.env.STRIPE_PRICE_CREATOR_INTRO = "price_creator_intro";
process.env.STRIPE_PRICE_CREATOR_MONTHLY = "price_creator";
process.env.STRIPE_PRICE_CREDITS_100 = "price_credits_100";
process.env.STRIPE_PRICE_CREDITS_300 = "price_credits_300";
process.env.BILLING_ENABLED = "true";
process.env.APP_BASE_URL = "https://images.example.com";

const billingModule = await import("../server/billing.js");
const databaseModule = await import("../server/db.js");
const securityModule = await import("../server/security.js");
const { createApp } = await import("../server/app.js");

const user = databaseModule.createUser({
  id: crypto.randomUUID(),
  name: "Billing Test",
  email: "billing@example.com",
  passwordHash: "scrypt:unusable:00",
  emailVerified: true,
  ledgerId: crypto.randomUUID(),
});
databaseModule.setStripeCustomer(user.id, "cus_product_test");
databaseModule.createBillingOrder({
  id: crypto.randomUUID(),
  userId: user.id,
  checkoutSessionId: "cs_credit_purchase",
  offerId: "credits_100",
  kind: "credits",
  credits: 100,
  amountCents: 700,
  currency: "usd",
});

const server = createApp().listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

function stripeSignature(body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const digest = crypto.createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function sendStripeEvent(event: Record<string, unknown>) {
  const body = JSON.stringify(event);
  return fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": stripeSignature(body) },
    body,
  });
}

test("Stripe adapter maps customers, Checkout, and the customer portal without storing access data", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body?: URLSearchParams; method?: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body as URLSearchParams | undefined, method: init?.method });
    if (url.endsWith("/v1/customers")) return new Response(JSON.stringify({ id: "cus_adapter" }), { status: 200 });
    if (url.endsWith("/v1/checkout/sessions")) return new Response(JSON.stringify({ id: "cs_adapter", url: "https://checkout.stripe.com/c/pay/test" }), { status: 200 });
    if (url.endsWith("/v1/billing_portal/sessions")) return new Response(JSON.stringify({ url: "https://billing.stripe.com/p/session/test" }), { status: 200 });
    if (url.includes("/v1/invoice_payments?")) return new Response(JSON.stringify({
      data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_adapter" } }],
    }), { status: 200 });
    if (url.endsWith("/v1/subscriptions/sub_adapter")) return new Response(JSON.stringify({ id: "sub_adapter", status: "canceled" }), { status: 200 });
    if (url.endsWith("/v1/customers/cus_adapter")) return new Response(JSON.stringify({ id: "cus_adapter", deleted: true }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: "Unexpected endpoint" } }), { status: 404 });
  };
  try {
    const customerId = await billingModule.createStripeCustomer(user);
    assert.equal(customerId, "cus_adapter");
    const offer = billingModule.findBillingOffer("creator_monthly")!;
    const checkout = await billingModule.createStripeCheckout({
      user,
      customerId,
      offer,
      successUrl: "https://images.example.com/studio/billing?checkout=success",
      cancelUrl: "https://images.example.com/studio/billing?checkout=canceled",
    });
    assert.equal(checkout.id, "cs_adapter");
    assert.equal(checkout.url, "https://checkout.stripe.com/c/pay/test");
    const checkoutBody = calls.find((call) => call.url.endsWith("/v1/checkout/sessions"))!.body!;
    assert.equal(checkoutBody.get("mode"), "subscription");
    assert.equal(checkoutBody.get("line_items[0][price]"), "price_creator");
    assert.equal(checkoutBody.get("subscription_data[metadata][user_id]"), user.id);
    assert.equal(await billingModule.createStripePortal(customerId, "https://images.example.com/studio/billing"), "https://billing.stripe.com/p/session/test");
    assert.equal(await billingModule.findPaidStripeInvoicePaymentIntent("in_adapter"), "pi_adapter");
    assert.equal(calls.find((call) => call.url.includes("/v1/invoice_payments?"))?.method, "GET");
    await billingModule.cancelStripeSubscription("sub_adapter");
    await billingModule.deleteStripeCustomer("cus_adapter");
    assert.equal(calls.find((call) => call.url.endsWith("/v1/subscriptions/sub_adapter"))?.method, "DELETE");
    assert.equal(calls.find((call) => call.url.endsWith("/v1/customers/cus_adapter"))?.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }

});

test("webhook signatures require the exact raw body and a recent timestamp", () => {
  const body = Buffer.from(JSON.stringify({ id: "evt_signature", type: "test.event", data: { object: { id: "obj_test" } } }));
  const timestamp = 1_800_000_000;
  const valid = stripeSignature(body.toString("utf8"), timestamp);
  assert.equal(billingModule.verifyStripeWebhook(body, valid, process.env.STRIPE_WEBHOOK_SECRET, timestamp).id, "evt_signature");
  assert.throws(() => billingModule.verifyStripeWebhook(Buffer.from(`${body.toString("utf8")} `), valid, process.env.STRIPE_WEBHOOK_SECRET, timestamp));
  assert.throws(() => billingModule.verifyStripeWebhook(body, valid, process.env.STRIPE_WEBHOOK_SECRET, timestamp + 301));
});

test("intro pricing survives refresh, migrates from guest to account, and closes after redemption", () => {
  const owner = databaseModule.createUser({
    id: crypto.randomUUID(),
    name: "Launch Price",
    email: "launch-price@example.com",
    passwordHash: "scrypt:unusable:00",
    emailVerified: true,
    ledgerId: crypto.randomUUID(),
  });
  const anonymousSessionId = crypto.randomUUID();
  databaseModule.createAnonymousSession({
    id: anonymousSessionId,
    tokenHash: securityModule.hashToken("launch-price-guest"),
    quotaDate: "2030-01-01",
    expiresAt: "2030-02-01T00:00:00.000Z",
  });
  const startedAt = new Date("2030-01-01T12:00:00.000Z");
  const first = databaseModule.getOrCreatePricingPromotion({ anonymousSessionId, now: startedAt });
  const refreshed = databaseModule.getOrCreatePricingPromotion({ anonymousSessionId, now: new Date(startedAt.getTime() + 5 * 60 * 1000) });
  assert.equal(first?.id, refreshed?.id);
  assert.equal(first?.expiresAt, refreshed?.expiresAt);
  assert.equal(databaseModule.migratePricingPromotion(anonymousSessionId, owner.id), true);
  assert.equal(databaseModule.getPricingPromotionForUser(owner.id, new Date(startedAt.getTime() + 9 * 60 * 1000))?.active, true);

  databaseModule.createBillingOrder({
    id: crypto.randomUUID(),
    userId: owner.id,
    checkoutSessionId: "cs_intro_redemption",
    offerId: "creator_intro",
    kind: "subscription",
    credits: 300,
    amountCents: 800,
    currency: "usd",
  });
  assert.equal(databaseModule.completeSubscriptionCheckout({
    checkoutSessionId: "cs_intro_redemption",
    customerId: "cus_intro_redemption",
    subscriptionId: "sub_intro_redemption",
  }), true);
  const redeemed = databaseModule.getPricingPromotionForUser(owner.id, new Date(startedAt.getTime() + 9 * 60 * 1000));
  assert.equal(redeemed?.redeemed, true);
  assert.equal(redeemed?.active, false);
});

test("price versions can change checkout economics without changing an existing Stripe Price contract", () => {
  const original = databaseModule.getBillingPriceVersionByStripePriceId("price_creator");
  assert.equal(original?.activeForCheckout, true);
  assert.equal(original?.amountCents, 1000);
  assert.equal(original?.credits, 300);

  const replacement = databaseModule.activateBillingPriceVersion({
    stripePriceId: "price_creator_v2",
    offerId: "creator_monthly",
    kind: "subscription",
    amountCents: 1200,
    credits: 450,
    effectiveFrom: "2030-01-01T00:00:00.000Z",
  });
  assert.equal(replacement.activeForCheckout, true);
  assert.equal(replacement.amountCents, 1200);
  assert.equal(replacement.credits, 450);
  assert.equal(databaseModule.getBillingPriceVersionByStripePriceId("price_creator")?.activeForCheckout, false);
  assert.equal(databaseModule.getBillingPriceVersionByStripePriceId("price_creator")?.credits, 300);
  assert.throws(() => databaseModule.activateBillingPriceVersion({
    stripePriceId: "price_creator",
    offerId: "creator_monthly",
    kind: "subscription",
    amountCents: 1000,
    credits: 999,
  }), /immutable/i);
});

test("signed webhooks fulfill credit packs and monthly subscription credits exactly once", async () => {
  const checkoutEvent = {
    id: "evt_credit_checkout",
    type: "checkout.session.completed",
    data: { object: { id: "cs_credit_purchase", mode: "payment", payment_status: "paid", customer: "cus_product_test", payment_intent: "pi_credit_purchase" } },
  };
  assert.equal((await sendStripeEvent(checkoutEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 120);
  assert.equal((await sendStripeEvent(checkoutEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 120);

  const invoiceEvent = {
    id: "evt_subscription_invoice",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_monthly_001",
        customer: "cus_product_test",
        subscription: "sub_creator",
        payment_intent: "pi_monthly_001",
        status: "paid",
        currency: "usd",
        amount_paid: 1000,
        billing_reason: "subscription_create",
        lines: { data: [{ price: { id: "price_creator" }, period: { end: 1_800_086_400 } }] },
      },
    },
  };
  assert.equal((await sendStripeEvent(invoiceEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 420);
  assert.equal((await sendStripeEvent(invoiceEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 420);
  assert.equal(databaseModule.getBillingState(user.id).plan, "creator");
  assert.equal(databaseModule.getBillingState(user.id).status, "active");

  const modernPeriodEnd = 1_826_755_200;
  const modernInvoiceEvent = {
    id: "evt_subscription_invoice_2026",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_monthly_2026",
        customer: "cus_product_test",
        status: "paid",
        currency: "usd",
        amount_paid: 1000,
        billing_reason: "subscription_cycle",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_creator" },
        },
        lines: {
          data: [{
            pricing: { type: "price_details", price_details: { price: "price_creator" } },
            period: { end: modernPeriodEnd },
          }],
        },
      },
    },
  };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.stripe.com/v1/invoice_payments?")) {
      assert.equal(init?.method, "GET");
      assert.match(url, /invoice=in_monthly_2026/);
      return new Response(JSON.stringify({
        data: [{
          status: "paid",
          payment: { type: "payment_intent", payment_intent: "pi_monthly_2026" },
        }],
      }), { status: 200 });
    }
    return nativeFetch(input, init);
  };
  try {
    assert.equal((await sendStripeEvent(modernInvoiceEvent)).status, 200);
  } finally {
    globalThis.fetch = nativeFetch;
  }
  assert.equal(databaseModule.getCreditAccount(user.id).available, 720);
  assert.equal(databaseModule.getBillingState(user.id).currentPeriodEnd, new Date(modernPeriodEnd * 1000).toISOString());
  assert.equal((await sendStripeEvent(modernInvoiceEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 720);

  const replacementInvoiceEvent = {
    id: "evt_subscription_invoice_v2",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_monthly_v2",
        customer: "cus_product_test",
        subscription: "sub_creator",
        payment_intent: "pi_monthly_v2",
        status: "paid",
        currency: "usd",
        amount_paid: 1200,
        billing_reason: "subscription_cycle",
        lines: { data: [{ price: { id: "price_creator_v2" }, period: { end: modernPeriodEnd + 2_592_000 } }] },
      },
    },
  };
  assert.equal((await sendStripeEvent(replacementInvoiceEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 1170);
  assert.equal((await sendStripeEvent(replacementInvoiceEvent)).status, 200);
  assert.equal(databaseModule.getCreditAccount(user.id).available, 1170);

  const deletedEvent = {
    id: "evt_subscription_deleted",
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_creator", customer: "cus_product_test", status: "canceled", cancel_at_period_end: false } },
  };
  assert.equal((await sendStripeEvent(deletedEvent)).status, 200);
  assert.equal(databaseModule.getBillingState(user.id).plan, "free");
  assert.equal(databaseModule.getBillingState(user.id).status, "canceled");

  const ledger = databaseModule.listCreditLedger(user.id, 20);
  assert.equal(ledger.filter((entry) => entry.type === "purchase_grant").length, 1);
  assert.equal(ledger.filter((entry) => entry.type === "subscription_grant").length, 3);

  const refundEvent = {
    id: "evt_credit_refund",
    type: "charge.refunded",
    data: { object: { id: "ch_refund", payment_intent: "pi_credit_purchase" } },
  };
  assert.equal((await sendStripeEvent(refundEvent)).status, 200);
  assert.equal(databaseModule.getBillingState(user.id).spendingBlocked, true);
  assert.match(databaseModule.getBillingState(user.id).blockReason ?? "", /refund/i);
});

test("failed webhook fulfillment remains retryable instead of swallowing the Stripe event", async () => {
  const event = {
    id: "evt_late_order",
    type: "checkout.session.completed",
    data: { object: { id: "cs_late_order", mode: "payment", payment_status: "paid", payment_intent: "pi_late_order" } },
  };
  assert.equal((await sendStripeEvent(event)).status, 503);
  databaseModule.createBillingOrder({
    id: crypto.randomUUID(), userId: user.id, checkoutSessionId: "cs_late_order", offerId: "credits_100",
    kind: "credits", credits: 100, amountCents: 700, currency: "usd",
  });
  assert.equal((await sendStripeEvent(event)).status, 200);
  assert.equal(databaseModule.listCreditLedger(user.id, 50).filter((entry) => entry.referenceId === "cs_late_order").length, 1);
});

test("Creator invoice fulfillment rejects the wrong Price, amount, or currency", async () => {
  const before = databaseModule.getCreditAccount(user.id).available;
  const response = await sendStripeEvent({
    id: "evt_invalid_invoice",
    type: "invoice.paid",
    data: { object: {
      id: "in_invalid", customer: "cus_product_test", subscription: "sub_creator", payment_intent: "pi_invalid",
      status: "paid", currency: "eur", amount_paid: 1, billing_reason: "subscription_cycle",
      lines: { data: [{ price: { id: "price_wrong" } }] },
    } },
  });
  assert.equal(response.status, 422);
  assert.equal(databaseModule.getCreditAccount(user.id).available, before);
});

test("webhook endpoint rejects unsigned payloads", async () => {
  const response = await fetch(`${baseUrl}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "evt_unsigned", type: "checkout.session.completed", data: { object: {} } }),
  });
  assert.equal(response.status, 400);
  const payload = await response.json() as { error: { code: string } };
  assert.equal(payload.error.code, "INVALID_SIGNATURE");
});

test("account deletion keeps local data unless Stripe subscription and customer cleanup both succeed", async () => {
  function createDeletableUser(suffix: string) {
    const created = databaseModule.createUser({
      id: crypto.randomUUID(), name: `Delete ${suffix}`, email: `delete-${suffix}@example.com`,
      passwordHash: securityModule.hashPassword("Delete1234"), emailVerified: true, ledgerId: crypto.randomUUID(),
    });
    databaseModule.setStripeCustomer(created.id, `cus_${suffix}`);
    databaseModule.createBillingOrder({
      id: crypto.randomUUID(), userId: created.id, checkoutSessionId: `cs_${suffix}`, offerId: "creator_monthly",
      kind: "subscription", credits: 300, amountCents: 1000, currency: "usd",
    });
    databaseModule.completeSubscriptionCheckout({ checkoutSessionId: `cs_${suffix}`, customerId: `cus_${suffix}`, subscriptionId: `sub_${suffix}` });
    const token = `session-${suffix}`;
    databaseModule.createSession({
      id: crypto.randomUUID(), userId: created.id, tokenHash: securityModule.hashToken(token),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    return { created, token };
  }

  const failed = createDeletableUser("cleanup_fail");
  const successful = createDeletableUser("cleanup_success");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/subscriptions/sub_cleanup_fail")) return new Response(JSON.stringify({ id: "sub_cleanup_fail", status: "canceled" }), { status: 200 });
    if (url.endsWith("/customers/cus_cleanup_fail")) return new Response(JSON.stringify({ error: { message: "Temporary Stripe failure" } }), { status: 503 });
    if (url.endsWith("/subscriptions/sub_cleanup_success")) return new Response(JSON.stringify({ id: "sub_cleanup_success", status: "canceled" }), { status: 200 });
    if (url.endsWith("/customers/cus_cleanup_success")) return new Response(JSON.stringify({ id: "cus_cleanup_success", deleted: true }), { status: 200 });
    return new Response(JSON.stringify({ error: { message: "Unexpected endpoint" } }), { status: 404 });
  };
  try {
    const failedResponse = await originalFetch(`${baseUrl}/api/account`, {
      method: "DELETE", headers: { Cookie: `qwen_session=${failed.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "Delete1234", confirmation: "DELETE" }),
    });
    assert.equal(failedResponse.status, 502);
    assert.ok(databaseModule.findUserById(failed.created.id));

    const successResponse = await originalFetch(`${baseUrl}/api/account`, {
      method: "DELETE", headers: { Cookie: `qwen_session=${successful.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "Delete1234", confirmation: "DELETE" }),
    });
    assert.equal(successResponse.status, 204);
    assert.equal(databaseModule.findUserById(successful.created.id), null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const lateCancellation = await sendStripeEvent({
    id: "evt_late_subscription_deleted",
    type: "customer.subscription.deleted",
    data: { object: {
      id: "sub_cleanup_success", customer: "cus_cleanup_success", status: "canceled", cancel_at_period_end: false,
    } },
  });
  assert.equal(lateCancellation.status, 200);
});
