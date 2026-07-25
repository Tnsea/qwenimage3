import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  creditMutationApplied,
  grantCredits,
  prepareCreditReservation,
  refundCredits,
  settleCredits,
} from "../worker/credits.js";
import { runMaintenance } from "../worker/maintenance.js";
import worker, { refundCreditsAtRisk } from "../worker/index.js";
import { hashPassword, hashToken } from "../worker/security.js";

async function createDatabase() {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const database = await miniflare.getD1Database("DB");
  const migrations = (await readdir("worker/migrations"))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();
  for (const file of migrations) {
    const migration = `worker/migrations/${file}`;
    const sql = (await readFile(migration, "utf8"))
      .replace(/^PRAGMA foreign_keys = ON;\s*/m, "");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
  const timestamp = new Date().toISOString();
  await database.batch([
    database.prepare(`INSERT INTO users
      (id, name, email_normalized, password_hash, created_at, updated_at)
      VALUES ('user-1', 'Test User', 'test@example.com', 'test-hash', ?, ?)`)
      .bind(timestamp, timestamp),
    database.prepare("INSERT INTO credit_accounts (user_id, available, reserved, updated_at) VALUES ('user-1', 4, 0, ?)")
      .bind(timestamp),
    database.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES ('user-1', ?)")
      .bind(timestamp),
  ]);
  return { miniflare, database };
}

test("D1 allows only one concurrent reservation to spend the same balance", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const first = prepareCreditReservation(database, {
      userId: "user-1",
      amount: 4,
      referenceId: "generation-1",
    });
    const second = prepareCreditReservation(database, {
      userId: "user-1",
      amount: 4,
      referenceId: "generation-2",
    });
    const results = await Promise.all([
      database.batch(first.statements),
      database.batch(second.statements),
    ]);
    assert.deepEqual(results.map((result) => creditMutationApplied(result)).sort(), [false, true]);
    const account = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(account, { available: 0, reserved: 4 });
    const ledger = await database.prepare("SELECT COUNT(*) count FROM credit_ledger WHERE type = 'generation_reservation'")
      .first<{ count: number }>();
    assert.equal(ledger?.count, 1);
  } finally {
    await miniflare.dispose();
  }
});

test("D1 grant references are exactly-once under concurrent replay", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const results = await Promise.all([
      grantCredits(database, {
        userId: "user-1",
        amount: 100,
        type: "purchase_grant",
        referenceId: "pi_replayed",
        description: "Purchase",
      }),
      grantCredits(database, {
        userId: "user-1",
        amount: 100,
        type: "purchase_grant",
        referenceId: "pi_replayed",
        description: "Purchase",
      }),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    const account = await database.prepare("SELECT available FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number }>();
    assert.equal(account?.available, 104);
    const ledger = await database.prepare(`SELECT COUNT(*) count FROM credit_ledger
      WHERE type = 'purchase_grant' AND reference_id = 'pi_replayed'`)
      .first<{ count: number }>();
    assert.equal(ledger?.count, 1);
  } finally {
    await miniflare.dispose();
  }
});

test("D1 gives one executor ownership of a concurrent idempotency key", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const claim = (id: string, generationId: string) => database.prepare(`INSERT OR IGNORE INTO generation_requests
      (id, user_id, idempotency_key, generation_id, status, created_at, updated_at, expires_at)
      VALUES (?, 'user-1', 'same-key', ?, 'claimed', ?, ?, ?)`)
      .bind(id, generationId, timestamp, timestamp, expiresAt)
      .run();
    const results = await Promise.all([
      claim("request-1", "generation-1"),
      claim("request-2", "generation-2"),
    ]);
    assert.deepEqual(results.map((result) => result.meta.changes ?? 0).sort(), [0, 1]);
    const winner = await database.prepare(`SELECT generation_id, status FROM generation_requests
      WHERE user_id = 'user-1' AND idempotency_key = 'same-key'`)
      .first<{ generation_id: string; status: string }>();
    assert.equal(winner?.status, "claimed");
    assert.ok(["generation-1", "generation-2"].includes(winner?.generation_id ?? ""));
  } finally {
    await miniflare.dispose();
  }
});

test("D1 settlement and refund cannot both consume one reservation", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const reservation = prepareCreditReservation(database, {
      userId: "user-1",
      amount: 2,
      referenceId: "generation-finalized",
    });
    assert.equal(creditMutationApplied(await database.batch(reservation.statements)), true);
    const settled = await Promise.all([
      settleCredits(database, {
        userId: "user-1",
        amount: 2,
        referenceId: "generation-finalized",
      }),
      settleCredits(database, {
        userId: "user-1",
        amount: 2,
        referenceId: "generation-finalized",
      }),
    ]);
    assert.deepEqual(settled.sort(), [false, true]);
    assert.equal(await refundCredits(database, {
      userId: "user-1",
      amount: 2,
      referenceId: "generation-finalized",
    }), false);
    const account = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(account, { available: 2, reserved: 0 });
  } finally {
    await miniflare.dispose();
  }
});

test("maintenance is repeatable and drains stranded settlements and R2 cleanup once", async () => {
  const { miniflare, database } = await createDatabase();
  const deleted: string[] = [];
  try {
    const timestamp = new Date().toISOString();
    const reservation = prepareCreditReservation(database, {
      userId: "user-1",
      amount: 2,
      referenceId: "generation-maintenance",
      timestamp,
    });
    assert.equal(creditMutationApplied(await database.batch(reservation.statements)), true);
    await database.batch([
      database.prepare(`INSERT INTO generations
        (id, owner_user_id, prompt, aspect_ratio, style, quality, status, width, height,
          provider, model, credit_cost, queue_tier, queued_at, created_at, updated_at)
        VALUES ('generation-maintenance', 'user-1', 'Maintenance result', '1:1',
          'Photorealistic', 'High', 'complete', 1024, 1024, 'local-preview',
          'local-qwen-preview', 2, 'free', ?, ?, ?)`)
        .bind(timestamp, timestamp, timestamp),
      database.prepare(`INSERT INTO r2_deletion_queue
        (object_key, reason, reference_id, created_at, updated_at)
        VALUES ('orphan/object.png', 'failed_generation', 'generation-old', ?, ?)`)
        .bind(timestamp, timestamp),
    ]);
    const environment = {
      DB: database,
      ASSETS_BUCKET: {
        async delete(key: string) {
          deleted.push(key);
        },
      },
    };
    await runMaintenance(environment as never, async () => undefined);
    await runMaintenance(environment as never, async () => undefined);

    const account = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(account, { available: 2, reserved: 0 });
    const settlements = await database.prepare(`SELECT COUNT(*) count FROM credit_ledger
      WHERE type = 'generation_settlement' AND reference_id = 'generation-maintenance'`)
      .first<{ count: number }>();
    assert.equal(settlements?.count, 1);
    const queued = await database.prepare("SELECT COUNT(*) count FROM r2_deletion_queue")
      .first<{ count: number }>();
    assert.equal(queued?.count, 0);
    const runs = await database.prepare("SELECT COUNT(*) count FROM maintenance_runs WHERE status = 'completed'")
      .first<{ count: number }>();
    assert.equal(runs?.count, 2);
    assert.deepEqual(deleted, ["orphan/object.png"]);
  } finally {
    await miniflare.dispose();
  }
});

test("Worker asynchronous Checkout replay grants a paid credit pack exactly once", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const timestamp = new Date().toISOString();
    await database.prepare(`INSERT INTO billing_orders
      (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents,
        currency, status, financial_status, stripe_price_id, created_at)
      VALUES ('order-worker', 'user-1', 'cs_worker_replay', 'credits_100', 'credits',
        100, 700, 'usd', 'pending', 'normal', 'price_worker_100', ?)`)
      .bind(timestamp)
      .run();
    const event = {
      id: "evt_worker_async_replay",
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_worker_replay",
          payment_status: "paid",
          payment_intent: "pi_worker_replay",
          metadata: { order_id: "order-worker" },
        },
      },
    };
    const body = JSON.stringify(event);
    const secret = "whsec_worker_test";
    const signedRequest = () => {
      const signedAt = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", secret).update(`${signedAt}.${body}`).digest("hex");
      return new Request("https://qwen-image-3.net/api/billing/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": `t=${signedAt},v1=${signature}`,
        },
        body,
      });
    };
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      STRIPE_WEBHOOK_SECRET: secret,
      DB: database,
      ASSETS_BUCKET: { delete: async () => undefined },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    const executionContext = { passThroughOnException() {}, waitUntil() {} };
    const first = await worker.fetch(signedRequest(), environment as never, executionContext as never);
    const replay = await worker.fetch(signedRequest(), environment as never, executionContext as never);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);

    const account = await database.prepare("SELECT available FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number }>();
    assert.equal(account?.available, 104);
    const ledger = await database.prepare(`SELECT COUNT(*) count FROM credit_ledger
      WHERE type = 'purchase_grant' AND reference_id = 'pi_worker_replay'`)
      .first<{ count: number }>();
    assert.equal(ledger?.count, 1);
    const payments = await database.prepare(`SELECT COUNT(*) count FROM billing_payments
      WHERE payment_intent_id = 'pi_worker_replay'`)
      .first<{ count: number }>();
    assert.equal(payments?.count, 1);
  } finally {
    await miniflare.dispose();
  }
});

test("Worker retries an early fraud warning that arrives before payment settlement, then quarantines it", async () => {
  const { miniflare, database } = await createDatabase();
  const originalFetch = globalThis.fetch;
  let chargeLookupCount = 0;
  try {
    const timestamp = new Date().toISOString();
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.stripe.com/v1/charges/ch_risk");
      assert.equal(init?.method, "GET");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer rk_test_runtime");
      chargeLookupCount += 1;
      return Response.json({ id: "ch_risk", payment_intent: "pi_risk" });
    };
    const event = {
      id: "evt_risk",
      type: "radar.early_fraud_warning.created",
      data: {
        object: {
          id: "issfr_risk",
          actionable: true,
          charge: "ch_risk",
          fraud_type: "unauthorized_use_of_card",
        },
      },
    };
    const body = JSON.stringify(event);
    const secret = "whsec_worker_risk";
    const signedRequest = () => {
      const signedAt = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", secret).update(`${signedAt}.${body}`).digest("hex");
      return new Request("https://qwen-image-3.net/api/billing/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": `t=${signedAt},v1=${signature}`,
        },
        body,
      });
    };
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      STRIPE_SECRET_KEY: "rk_test_runtime",
      STRIPE_WEBHOOK_SECRET: secret,
      DB: database,
      ASSETS_BUCKET: { delete: async () => undefined },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    const executionContext = { passThroughOnException() {}, waitUntil() {} };
    const beforePayment = await worker.fetch(signedRequest(), environment as never, executionContext as never);
    assert.equal(beforePayment.status, 503);
    await database.batch([
      database.prepare(`INSERT INTO billing_orders
        (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents,
          currency, status, payment_intent_id, financial_status, stripe_price_id, created_at, completed_at)
        VALUES ('order-risk', 'user-1', 'cs_risk', 'credits_400', 'credits', 400, 1200,
          'usd', 'paid', 'pi_risk', 'normal', 'price_1TwMSbHyVvkt92TEBWGvGd0Y', ?, ?)`)
        .bind(timestamp, timestamp),
      database.prepare(`INSERT INTO billing_payments
        (payment_intent_id, user_id, billing_order_id, kind, credits_granted, amount_cents,
          currency, status, stripe_price_id, created_at, updated_at)
        VALUES ('pi_risk', 'user-1', 'order-risk', 'credits', 400, 1200,
          'usd', 'paid', 'price_1TwMSbHyVvkt92TEBWGvGd0Y', ?, ?)`)
        .bind(timestamp, timestamp),
    ]);
    const first = await worker.fetch(signedRequest(), environment as never, executionContext as never);
    const replay = await worker.fetch(signedRequest(), environment as never, executionContext as never);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(chargeLookupCount, 2);

    const account = await database.prepare(`SELECT spending_blocked, block_reason
      FROM billing_accounts WHERE user_id = 'user-1'`)
      .first<{ spending_blocked: number; block_reason: string | null }>();
    assert.equal(account?.spending_blocked, 1);
    assert.match(account?.block_reason ?? "", /payment risk review/i);
    const risk = await database.prepare(`SELECT warning_id, charge_id, payment_intent_id,
      actionable, fraud_type, status FROM billing_risk_events WHERE stripe_event_id = 'evt_risk'`)
      .first<{
        warning_id: string;
        charge_id: string;
        payment_intent_id: string;
        actionable: number;
        fraud_type: string;
        status: string;
      }>();
    assert.deepEqual(risk, {
      warning_id: "issfr_risk",
      charge_id: "ch_risk",
      payment_intent_id: "pi_risk",
      actionable: 1,
      fraud_type: "unauthorized_use_of_card",
      status: "open",
    });
    const payment = await database.prepare(`SELECT status, financial_event_id
      FROM billing_payments WHERE payment_intent_id = 'pi_risk'`)
      .first<{ status: string; financial_event_id: string | null }>();
    assert.deepEqual(payment, { status: "paid", financial_event_id: "evt_risk" });
    const order = await database.prepare(`SELECT financial_status, financial_event_id
      FROM billing_orders WHERE id = 'order-risk'`)
      .first<{ financial_status: string; financial_event_id: string | null }>();
    assert.deepEqual(order, { financial_status: "normal", financial_event_id: "evt_risk" });
    const recordedEvent = await database.prepare(`SELECT status, attempts, last_error
      FROM billing_events WHERE stripe_event_id = 'evt_risk'`)
      .first<{ status: string; attempts: number; last_error: string | null }>();
    assert.deepEqual(recordedEvent, { status: "completed", attempts: 2, last_error: null });
  } finally {
    globalThis.fetch = originalFetch;
    await miniflare.dispose();
  }
});

test("billing review resolution is authenticated, idempotent, non-negative, and consolidated per payment", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    assert.deepEqual(refundCreditsAtRisk(400, 1200, 300), {
      amountCentsAtRisk: 300,
      creditsAtRisk: 100,
    });
    assert.deepEqual(refundCreditsAtRisk(400, 1200, 301), {
      amountCentsAtRisk: 301,
      creditsAtRisk: 101,
    });
    assert.deepEqual(refundCreditsAtRisk(400, 1200, undefined), {
      amountCentsAtRisk: 1200,
      creditsAtRisk: 400,
    });
    const timestamp = new Date().toISOString();
    await database.batch([
      database.prepare(`INSERT INTO billing_orders
        (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents,
          currency, status, payment_intent_id, financial_status, stripe_price_id,
          created_at, completed_at)
        VALUES ('order-review', 'user-1', 'cs_review', 'credits_400', 'credits',
          400, 1200, 'usd', 'paid', 'pi_review', 'normal',
          'price_1TwMSbHyVvkt92TEBWGvGd0Y', ?, ?)`)
        .bind(timestamp, timestamp),
      database.prepare(`INSERT INTO billing_payments
        (payment_intent_id, user_id, billing_order_id, kind, credits_granted,
          amount_cents, currency, status, stripe_price_id, created_at, updated_at)
        VALUES ('pi_review', 'user-1', 'order-review', 'credits', 400, 1200,
          'usd', 'paid', 'price_1TwMSbHyVvkt92TEBWGvGd0Y', ?, ?)`)
        .bind(timestamp, timestamp),
    ]);
    const webhookSecret = "whsec_review_resolution";
    const operatorToken = "billing-operator-test-token-1234567890";
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      BILLING_OPERATOR_TOKEN: operatorToken,
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      STRIPE_WEBHOOK_SECRET: webhookSecret,
      DB: database,
      ASSETS_BUCKET: { delete: async () => undefined },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    const executionContext = { passThroughOnException() {}, waitUntil() {} };
    const sendEvent = async (event: Record<string, unknown>) => {
      const body = JSON.stringify(event);
      const signedAt = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", webhookSecret)
        .update(`${signedAt}.${body}`)
        .digest("hex");
      return worker.fetch(new Request("https://qwen-image-3.net/api/billing/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": `t=${signedAt},v1=${signature}`,
        },
        body,
      }), environment as never, executionContext as never);
    };
    const operatorRequest = (
      path: string,
      init: RequestInit = {},
    ) => worker.fetch(new Request(`https://qwen-image-3.net${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        "Content-Type": "application/json",
        "X-Operator-Id": "risk@example.com",
        ...(init.headers || {}),
      },
    }), environment as never, executionContext as never);

    assert.equal((await sendEvent({
      id: "evt_review_radar",
      type: "radar.early_fraud_warning.created",
      data: { object: {
        id: "issfr_review",
        actionable: true,
        charge: { id: "ch_review", payment_intent: "pi_review" },
        fraud_type: "made_with_stolen_card",
      } },
    })).status, 200);

    const unauthorized = await worker.fetch(
      new Request("https://qwen-image-3.net/api/operator/billing/reviews"),
      environment as never,
      executionContext as never,
    );
    assert.equal(unauthorized.status, 401);
    const listed = await operatorRequest("/api/operator/billing/reviews");
    assert.equal(listed.status, 200);
    const listedBody = await listed.json() as {
      reviews: Array<{ id: string; creditsAtRisk: number; status: string }>;
    };
    assert.equal(listedBody.reviews.length, 1);
    assert.equal(listedBody.reviews[0]?.creditsAtRisk, 400);
    assert.equal(listedBody.reviews[0]?.status, "open");
    const reviewId = listedBody.reviews[0]!.id;

    const cleared = await operatorRequest(
      `/api/operator/billing/reviews/${reviewId}/resolve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "review-clear-001" },
        body: JSON.stringify({
          decision: "cleared",
          note: "Stripe evidence confirms the Radar warning was a false positive.",
        }),
      },
    );
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json() as { replayed: boolean }).replayed, false);
    let account = await database.prepare(`SELECT spending_blocked, block_reason
      FROM billing_accounts WHERE user_id = 'user-1'`)
      .first<{ spending_blocked: number; block_reason: string | null }>();
    assert.deepEqual(account, { spending_blocked: 0, block_reason: null });

    assert.equal((await sendEvent({
      id: "evt_review_refund",
      type: "charge.refunded",
      data: { object: {
        id: "ch_review",
        payment_intent: "pi_review",
        amount_refunded: 1200,
      } },
    })).status, 200);
    const oneReview = await database.prepare("SELECT COUNT(*) count FROM billing_reviews")
      .first<{ count: number }>();
    const twoTriggers = await database.prepare("SELECT COUNT(*) count FROM billing_review_events")
      .first<{ count: number }>();
    assert.equal(oneReview?.count, 1);
    assert.equal(twoTriggers?.count, 2);
    const degradedHealth = await worker.fetch(
      new Request("https://qwen-image-3.net/api/health"),
      environment as never,
      executionContext as never,
    );
    const degradedHealthBody = await degradedHealth.json() as {
      status: string;
      billing: {
        reviewHealth: {
          healthy: boolean;
          openReviews: number;
          outstandingLossReviews: number;
        };
      };
    };
    assert.equal(degradedHealthBody.status, "degraded");
    assert.deepEqual(degradedHealthBody.billing.reviewHealth, {
      healthy: false,
      openReviews: 1,
      outstandingLossReviews: 0,
    });
    const checkoutApiSecret = "qh_checkout_review_block";
    await database.batch([
      database.prepare("UPDATE users SET email_verified_at = ? WHERE id = 'user-1'")
        .bind(timestamp),
      database.prepare(`INSERT INTO api_keys
        (id, user_id, name, prefix, secret_hash, scopes, created_at)
        VALUES ('key-review-checkout', 'user-1', 'Review checkout',
          'qh_checkout', ?, 'generations:write', ?)`)
        .bind(await hashToken(checkoutApiSecret), timestamp),
    ]);
    const blockedCheckout = await worker.fetch(new Request(
      "https://qwen-image-3.net/api/billing/checkout",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${checkoutApiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ offerId: "credits_400" }),
      },
    ), {
      ...environment,
      BILLING_ENABLED: "true",
      STRIPE_SECRET_KEY: "rk_test_checkout_review",
      STRIPE_PRICE_CREDITS_400: "price_1TwMSbHyVvkt92TEBWGvGd0Y",
    } as never, executionContext as never);
    assert.equal(blockedCheckout.status, 423);
    assert.equal(
      (await blockedCheckout.json() as { error: { code: string } }).error.code,
      "BILLING_REVIEW_REQUIRED",
    );
    const invalidClear = await operatorRequest(
      `/api/operator/billing/reviews/${reviewId}/resolve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "review-clear-002" },
        body: JSON.stringify({
          decision: "cleared",
          note: "A completed refund cannot be cleared without recovering the loss.",
        }),
      },
    );
    assert.equal(invalidClear.status, 409);

    const firstRecovery = await operatorRequest(
      `/api/operator/billing/reviews/${reviewId}/resolve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "review-recover-001" },
        body: JSON.stringify({
          decision: "confirmed_loss",
          note: "The refund is confirmed; recover only credits that remain available.",
        }),
      },
    );
    assert.equal(firstRecovery.status, 200);
    const firstRecoveryBody = await firstRecovery.json() as {
      action: {
        reviewId: string;
        decision: string;
        creditsReclaimed: number;
        unrecoveredAfter: number;
        operatorId: string;
      };
      replayed: boolean;
    };
    assert.equal(firstRecoveryBody.replayed, false);
    assert.equal(firstRecoveryBody.action.reviewId, reviewId);
    assert.equal(firstRecoveryBody.action.decision, "confirmed_loss");
    assert.equal(firstRecoveryBody.action.creditsReclaimed, 4);
    assert.equal(firstRecoveryBody.action.unrecoveredAfter, 396);
    assert.equal(firstRecoveryBody.action.operatorId, "risk@example.com");
    account = await database.prepare(`SELECT spending_blocked, block_reason
      FROM billing_accounts WHERE user_id = 'user-1'`)
      .first<{ spending_blocked: number; block_reason: string | null }>();
    assert.equal(account?.spending_blocked, 1);
    assert.match(account?.block_reason ?? "", /unrecovered payment loss/i);
    const afterFirstRecovery = await database.prepare(`SELECT available, reserved
      FROM credit_accounts WHERE user_id = 'user-1'`)
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(afterFirstRecovery, { available: 0, reserved: 0 });

    const replayedRecovery = await operatorRequest(
      `/api/operator/billing/reviews/${reviewId}/resolve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "review-recover-001" },
        body: JSON.stringify({
          decision: "confirmed_loss",
          note: "The refund is confirmed; recover only credits that remain available.",
        }),
      },
    );
    assert.equal(replayedRecovery.status, 200);
    assert.equal((await replayedRecovery.json() as { replayed: boolean }).replayed, true);

    await grantCredits(database, {
      userId: "user-1",
      amount: 400,
      type: "manual_adjustment",
      referenceId: "support-repayment",
      description: "Support-approved repayment",
    });
    const secondRecovery = await operatorRequest(
      `/api/operator/billing/reviews/${reviewId}/resolve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": "review-recover-002" },
        body: JSON.stringify({
          decision: "confirmed_loss",
          note: "Recover the remaining disputed credits after support repayment.",
        }),
      },
    );
    assert.equal(secondRecovery.status, 200);
    const secondRecoveryBody = await secondRecovery.json() as {
      action: { creditsReclaimed: number; unrecoveredAfter: number };
    };
    assert.equal(secondRecoveryBody.action.creditsReclaimed, 396);
    assert.equal(secondRecoveryBody.action.unrecoveredAfter, 0);
    const finalReview = await database.prepare(`SELECT status, decision,
        credits_at_risk, credits_reclaimed, unrecovered_credits
      FROM billing_reviews WHERE id = ?`)
      .bind(reviewId)
      .first<{
        status: string;
        decision: string;
        credits_at_risk: number;
        credits_reclaimed: number;
        unrecovered_credits: number;
      }>();
    assert.deepEqual(finalReview, {
      status: "resolved",
      decision: "confirmed_loss",
      credits_at_risk: 400,
      credits_reclaimed: 400,
      unrecovered_credits: 0,
    });
    const finalCredits = await database.prepare(`SELECT available, reserved
      FROM credit_accounts WHERE user_id = 'user-1'`)
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(finalCredits, { available: 4, reserved: 0 });
    account = await database.prepare(`SELECT spending_blocked, block_reason
      FROM billing_accounts WHERE user_id = 'user-1'`)
      .first<{ spending_blocked: number; block_reason: string | null }>();
    assert.deepEqual(account, { spending_blocked: 0, block_reason: null });
    const adjustments = await database.prepare(`SELECT COUNT(*) count, SUM(amount) total
      FROM credit_ledger
      WHERE type = 'manual_adjustment' AND description = 'Billing loss credit recovery'`)
      .first<{ count: number; total: number }>();
    assert.deepEqual(adjustments, { count: 2, total: -400 });
    const recoveredHealth = await worker.fetch(
      new Request("https://qwen-image-3.net/api/health"),
      environment as never,
      executionContext as never,
    );
    const recoveredHealthBody = await recoveredHealth.json() as {
      status: string;
      billing: {
        reviewHealth: {
          healthy: boolean;
          openReviews: number;
          outstandingLossReviews: number;
        };
      };
    };
    assert.equal(recoveredHealthBody.status, "ok");
    assert.deepEqual(recoveredHealthBody.billing.reviewHealth, {
      healthy: true,
      openReviews: 0,
      outstandingLossReviews: 0,
    });
  } finally {
    await miniflare.dispose();
  }
});

test("Worker recognizes Stripe Portal scheduled cancellation from the current cancel_at field", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    await database.prepare(`UPDATE billing_accounts
      SET stripe_customer_id = 'cus_portal', stripe_subscription_id = 'sub_portal',
        plan = 'creator', plan_tier = 'starter', billing_interval = 'month',
        active_offer_id = 'starter_monthly', status = 'active'
      WHERE user_id = 'user-1'`).run();
    const event = {
      id: "evt_portal_cancel",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_portal",
          customer: "cus_portal",
          status: "active",
          cancel_at_period_end: false,
          cancel_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      },
    };
    const body = JSON.stringify(event);
    const secret = "whsec_portal_cancel";
    const signedAt = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${signedAt}.${body}`).digest("hex");
    const response = await worker.fetch(new Request("https://qwen-image-3.net/api/billing/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": `t=${signedAt},v1=${signature}`,
      },
      body,
    }), {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      STRIPE_WEBHOOK_SECRET: secret,
      DB: database,
      ASSETS_BUCKET: { delete: async () => undefined },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    } as never, { passThroughOnException() {}, waitUntil() {} } as never);
    assert.equal(response.status, 200);
    const account = await database.prepare(`SELECT plan_tier, status, cancel_at_period_end
      FROM billing_accounts WHERE user_id = 'user-1'`)
      .first<{ plan_tier: string; status: string; cancel_at_period_end: number }>();
    assert.deepEqual(account, { plan_tier: "starter", status: "active", cancel_at_period_end: 1 });
  } finally {
    await miniflare.dispose();
  }
});

test("account deletion tolerates already-missing Stripe objects and tombstones late billing events", async () => {
  const { miniflare, database } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const timestamp = new Date().toISOString();
    const sessionToken = "session-deleted-billing-owner";
    await database.batch([
      database.prepare(`UPDATE users SET password_hash = ?, email_verified_at = ?
        WHERE id = 'user-1'`).bind(await hashPassword("Delete1234"), timestamp),
      database.prepare(`INSERT INTO sessions
        (id, user_id, token_hash, user_agent, ip_hint, expires_at, last_seen_at, created_at)
        VALUES ('session-delete', 'user-1', ?, 'test', 'test',
          '2099-01-01T00:00:00.000Z', ?, ?)`)
        .bind(await hashToken(sessionToken), timestamp, timestamp),
      database.prepare(`UPDATE billing_accounts
        SET stripe_customer_id = 'cus_deleted', stripe_subscription_id = 'sub_deleted',
          plan = 'creator', plan_tier = 'creator', billing_interval = 'month',
          active_offer_id = 'creator_monthly', status = 'canceled'
        WHERE user_id = 'user-1'`),
      database.prepare(`INSERT INTO billing_orders
        (id, user_id, stripe_checkout_session_id, offer_id, kind, credits, amount_cents,
          currency, status, payment_intent_id, financial_status, stripe_price_id, created_at, completed_at)
        VALUES ('order-deleted', 'user-1', 'cs_deleted', 'credits_400', 'credits', 400, 1200,
          'usd', 'paid', 'pi_deleted', 'normal', 'price_1TwMSbHyVvkt92TEBWGvGd0Y', ?, ?)`)
        .bind(timestamp, timestamp),
      database.prepare(`INSERT INTO billing_payments
        (payment_intent_id, user_id, billing_order_id, kind, credits_granted, amount_cents,
          currency, status, stripe_price_id, created_at, updated_at)
        VALUES ('pi_deleted', 'user-1', 'order-deleted', 'credits', 400, 1200,
          'usd', 'paid', 'price_1TwMSbHyVvkt92TEBWGvGd0Y', ?, ?)`)
        .bind(timestamp, timestamp),
    ]);
    globalThis.fetch = async (input, init) => {
      assert.equal(init?.method, "DELETE");
      const url = String(input);
      assert.ok(url.endsWith("/subscriptions/sub_deleted") || url.endsWith("/customers/cus_deleted"));
      return Response.json({
        error: {
          code: "resource_missing",
          message: url.includes("/subscriptions/")
            ? "No such subscription: 'sub_deleted'"
            : "No such customer: 'cus_deleted'",
        },
      }, { status: 404 });
    };
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      STRIPE_SECRET_KEY: "rk_test_runtime",
      STRIPE_WEBHOOK_SECRET: "whsec_deleted_owner",
      DB: database,
      ASSETS_BUCKET: { delete: async () => undefined },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    const executionContext = { passThroughOnException() {}, waitUntil() {} };
    const deletion = await worker.fetch(new Request("https://qwen-image-3.net/api/account", {
      method: "DELETE",
      headers: {
        Cookie: `qwen_session=${sessionToken}`,
        "Content-Type": "application/json",
        Origin: "https://qwen-image-3.net",
      },
      body: JSON.stringify({ password: "Delete1234", confirmation: "DELETE" }),
    }), environment as never, executionContext as never);
    assert.equal(deletion.status, 204);
    assert.equal(await database.prepare("SELECT id FROM users WHERE id = 'user-1'").first(), null);
    const audit = await database.prepare(`SELECT stripe_customer_id, stripe_subscription_id
      FROM account_deletion_audit WHERE former_user_id = 'user-1'`)
      .first<{ stripe_customer_id: string; stripe_subscription_id: string }>();
    assert.deepEqual(audit, {
      stripe_customer_id: "cus_deleted",
      stripe_subscription_id: "sub_deleted",
    });
    const tombstone = await database.prepare(`SELECT former_user_id
      FROM billing_deleted_payment_tombstones WHERE payment_intent_id = 'pi_deleted'`)
      .first<{ former_user_id: string }>();
    assert.equal(tombstone?.former_user_id, "user-1");

    const sendLateEvent = async (event: Record<string, unknown>) => {
      const body = JSON.stringify(event);
      const signedAt = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", "whsec_deleted_owner")
        .update(`${signedAt}.${body}`)
        .digest("hex");
      return worker.fetch(new Request("https://qwen-image-3.net/api/billing/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": `t=${signedAt},v1=${signature}`,
        },
        body,
      }), environment as never, executionContext as never);
    };
    const checkout = await sendLateEvent({
      id: "evt_deleted_checkout",
      type: "checkout.session.completed",
      data: { object: {
        id: "cs_deleted_late",
        payment_status: "paid",
        payment_intent: "pi_deleted",
        metadata: { user_id: "user-1" },
      } },
    });
    const invoice = await sendLateEvent({
      id: "evt_deleted_invoice",
      type: "invoice.paid",
      data: { object: {
        id: "in_deleted_late",
        customer: "cus_deleted",
        subscription: "sub_deleted",
        status: "paid",
        currency: "usd",
        amount_paid: 0,
        billing_reason: "subscription_cycle",
        lines: { data: [] },
      } },
    });
    const refund = await sendLateEvent({
      id: "evt_deleted_refund",
      type: "charge.refunded",
      data: { object: { id: "ch_deleted", payment_intent: "pi_deleted" } },
    });
    const radar = await sendLateEvent({
      id: "evt_deleted_radar",
      type: "radar.early_fraud_warning.created",
      data: { object: {
        id: "issfr_deleted",
        actionable: true,
        charge: { id: "ch_deleted", payment_intent: "pi_deleted" },
        fraud_type: "unauthorized_use_of_card",
      } },
    });
    assert.deepEqual(
      [checkout.status, invoice.status, refund.status, radar.status],
      [200, 200, 200, 200],
    );
    const events = await database.prepare(`SELECT COUNT(*) count FROM billing_events
      WHERE stripe_event_id IN (
        'evt_deleted_checkout', 'evt_deleted_invoice', 'evt_deleted_refund', 'evt_deleted_radar'
      ) AND status = 'completed'`).first<{ count: number }>();
    assert.equal(events?.count, 4);
  } finally {
    globalThis.fetch = originalFetch;
    await miniflare.dispose();
  }
});

test("health degrades when a Stripe event needs operator attention", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const timestamp = new Date().toISOString();
    await database.prepare(`INSERT INTO billing_events
      (stripe_event_id, type, status, attempts, payload_json, last_error,
        processing_started_at, updated_at)
      VALUES ('evt_health_failed', 'invoice.payment_failed', 'failed', 3, '{}',
        'Acceptance failure', ?, ?)`)
      .bind(timestamp, timestamp)
      .run();
    const response = await worker.fetch(new Request("https://qwen-image-3.net/api/health"), {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      DB: database,
      ASSETS_BUCKET: { delete: async () => undefined },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    } as never, { passThroughOnException() {}, waitUntil() {} } as never);
    assert.equal(response.status, 200);
    const health = await response.json() as {
      status: string;
      billing: {
        eventHealth: { healthy: boolean; failedEvents: number; staleEvents: number };
      };
    };
    assert.equal(health.status, "degraded");
    assert.deepEqual(health.billing.eventHealth, {
      healthy: false,
      failedEvents: 1,
      staleEvents: 0,
    });
  } finally {
    await miniflare.dispose();
  }
});

test("Worker generation idempotency elects one executor, returns 409 in flight, and logs every result", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    await database.prepare("UPDATE credit_accounts SET available = 16 WHERE user_id = 'user-1'").run();
    const apiSecret = "qh_test_worker_idempotency";
    await database.prepare(`INSERT INTO api_keys
      (id, user_id, name, prefix, secret_hash, scopes, created_at)
      VALUES ('key-worker', 'user-1', 'Worker test', 'qh_test', ?, 'generations:write', ?)`)
      .bind(await hashToken(apiSecret), new Date().toISOString())
      .run();
    const objects = new Map<string, Uint8Array>();
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      FREE_QUEUE_DELAY_MS: "1",
      DB: database,
      ASSETS_BUCKET: {
        async put(key: string, value: Uint8Array) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          objects.set(key, value);
        },
        async delete(key: string) {
          objects.delete(key);
        },
      },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    const executionContext = { passThroughOnException() {}, waitUntil() {} };
    const request = () => new Request("https://qwen-image-3.net/v1/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiSecret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "worker-concurrent-key",
      },
      body: JSON.stringify({
        prompt: "A private worker idempotency test",
        aspect_ratio: "1:1",
        style: "photorealistic",
        quality: "high",
      }),
    });
    const responses = await Promise.all([
      worker.fetch(request(), environment as never, executionContext as never),
      worker.fetch(request(), environment as never, executionContext as never),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    const winner = responses.find((response) => response.status === 201)!;
    const created = await winner.json() as { id: string };

    const replay = await worker.fetch(request(), environment as never, executionContext as never);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as { id: string }).id, created.id);

    const account = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(account, { available: 8, reserved: 0 });
    const generations = await database.prepare("SELECT COUNT(*) count FROM generations")
      .first<{ count: number }>();
    assert.equal(generations?.count, 1);
    const logs = await database.prepare(`SELECT status_code FROM api_request_logs
      WHERE api_key_id = 'key-worker' ORDER BY created_at`)
      .all<{ status_code: number }>();
    assert.deepEqual(logs.results.map((row) => row.status_code).sort(), [200, 201, 409]);
  } finally {
    await miniflare.dispose();
  }
});

test("Worker queues web generations, exposes processing state, and settles after durable consumption", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    await database.prepare("UPDATE credit_accounts SET available = 16 WHERE user_id = 'user-1'").run();
    const apiSecret = "qh_test_worker_queue";
    await database.prepare(`INSERT INTO api_keys
      (id, user_id, name, prefix, secret_hash, scopes, created_at)
      VALUES ('key-queue', 'user-1', 'Queue test', 'qh_queue', ?, 'generations:write', ?)`)
      .bind(await hashToken(apiSecret), new Date().toISOString())
      .run();
    let queuedMessage: unknown;
    let priorityQueuedMessage: unknown;
    const objects = new Map<string, Uint8Array>();
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      FREE_QUEUE_DELAY_MS: "0",
      DB: database,
      GENERATION_QUEUE: {
        async send(message: unknown) {
          queuedMessage = message;
        },
      },
      GENERATION_PRIORITY_QUEUE: {
        async send(message: unknown) {
          priorityQueuedMessage = message;
        },
      },
      ASSETS_BUCKET: {
        async put(key: string, value: Uint8Array) {
          objects.set(key, value);
        },
        async delete(key: string) {
          objects.delete(key);
        },
      },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    const executionContext = { passThroughOnException() {}, waitUntil() {} };
    const authorization = { Authorization: `Bearer ${apiSecret}` };
    const create = await worker.fetch(new Request("https://qwen-image-3.net/v1/generations", {
      method: "POST",
      headers: {
        ...authorization,
        "Content-Type": "application/json",
        "Idempotency-Key": "durable-queue-key",
      },
      body: JSON.stringify({
        prompt: "A durable queued generation",
        aspect_ratio: "1:1",
        style: "editorial",
        quality: "standard",
      }),
    }), environment as never, executionContext as never);
    const accepted = await create.json() as { id: string; status: string };
    assert.equal(create.status, 202);
    assert.equal(accepted.status, "processing");
    assert.equal(create.headers.get("location"), `/v1/generations/${accepted.id}`);
    assert.ok(queuedMessage);

    const processing = await worker.fetch(
      new Request(`https://qwen-image-3.net/v1/generations/${accepted.id}`, { headers: authorization }),
      environment as never,
      executionContext as never,
    );
    assert.equal(processing.status, 200);
    assert.equal((await processing.json() as { status: string }).status, "processing");
    const reserved = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(reserved, { available: 12, reserved: 4 });

    let acknowledged = false;
    await worker.queue({
      queue: "qwen-image-3-generation",
      messages: [{
        id: "message-1",
        timestamp: new Date(),
        body: queuedMessage,
        attempts: 1,
        ack() {
          acknowledged = true;
        },
        retry() {
          assert.fail("Successful local generation must not retry.");
        },
      }],
      ackAll() {},
      retryAll() {},
    } as never, environment as never);
    assert.equal(acknowledged, true);

    const completed = await worker.fetch(
      new Request(`https://qwen-image-3.net/v1/generations/${accepted.id}`, { headers: authorization }),
      environment as never,
      executionContext as never,
    );
    const completedBody = await completed.json() as { status: string; imageUrl: string | null };
    assert.equal(completedBody.status, "complete");
    assert.match(completedBody.imageUrl ?? "", new RegExp(`/api/generations/${accepted.id}/image$`));
    const settled = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(settled, { available: 12, reserved: 0 });
    assert.equal(objects.size, 1);

    await database.prepare(`UPDATE billing_accounts
      SET plan = 'creator', plan_tier = 'creator', status = 'active'
      WHERE user_id = 'user-1'`).run();
    const priorityCreate = await worker.fetch(new Request("https://qwen-image-3.net/v1/generations", {
      method: "POST",
      headers: {
        ...authorization,
        "Content-Type": "application/json",
        "Idempotency-Key": "durable-priority-queue-key",
      },
      body: JSON.stringify({
        model: "local-qwen-preview",
        prompt: "A priority queue test",
        aspect_ratio: "1:1",
        style: "editorial",
        quality: "standard",
      }),
    }), environment as never, executionContext as never);
    assert.equal(priorityCreate.status, 202);
    assert.equal(priorityCreate.headers.get("x-generation-queue"), "vip");
    assert.equal((priorityQueuedMessage as { queueTier?: string })?.queueTier, "vip");
    const priorityReserved = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(priorityReserved, { available: 8, reserved: 4 });
  } finally {
    await miniflare.dispose();
  }
});

test("Worker queue permanently fails unavailable generations and refunds reserved credits", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const generationId = "queued-failure";
    const timestamp = new Date().toISOString();
    const reservation = prepareCreditReservation(database, {
      userId: "user-1",
      amount: 1,
      referenceId: generationId,
      timestamp,
    });
    await database.batch([
      ...reservation.statements,
      database.prepare(`INSERT INTO generations
        (id, owner_user_id, prompt, aspect_ratio, style, quality, status, provider, model,
          credit_cost, queue_tier, queued_at, created_at, updated_at)
        VALUES (?, 'user-1', 'A queued failure', '1:1', 'Editorial', 'Standard',
          'processing', 'unavailable', 'unavailable-model', 1, 'free', ?, ?, ?)`)
        .bind(generationId, timestamp, timestamp, timestamp),
    ]);
    const environment = {
      APP_BASE_URL: "https://qwen-image-3.net",
      BILLING_ENABLED: "false",
      GENERATION_PROVIDER: "local",
      QWEN_MODEL_ID: "local-qwen-preview",
      FREE_QUEUE_DELAY_MS: "0",
      DB: database,
      ASSETS_BUCKET: {
        async put() {
          assert.fail("Unavailable provider must not persist an object.");
        },
        async delete() {},
      },
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    };
    let acknowledged = false;
    let retried = false;
    await worker.queue({
      queue: "qwen-image-3-generation",
      messages: [{
        id: "message-failure",
        timestamp: new Date(),
        body: {
          generationId,
          userId: "user-1",
          input: {
            prompt: "A queued failure",
            modelId: "unavailable-model",
            aspectRatio: "1:1",
            style: "Editorial",
            quality: "Standard",
          },
          creditCost: 1,
          queueTier: "free",
          generationRequestId: null,
          requestId: "request-failure",
        },
        attempts: 1,
        ack() {
          acknowledged = true;
        },
        retry() {
          retried = true;
        },
      }],
      ackAll() {},
      retryAll() {},
    } as never, environment as never);

    assert.equal(acknowledged, true);
    assert.equal(retried, false);
    const generation = await database.prepare("SELECT status FROM generations WHERE id = ?")
      .bind(generationId)
      .first<{ status: string }>();
    assert.equal(generation?.status, "failed");
    const account = await database.prepare("SELECT available, reserved FROM credit_accounts WHERE user_id = 'user-1'")
      .first<{ available: number; reserved: number }>();
    assert.deepEqual(account, { available: 4, reserved: 0 });
    const refund = await database.prepare(`SELECT COUNT(*) count FROM credit_ledger
      WHERE type = 'generation_refund' AND reference_id = ?`)
      .bind(generationId)
      .first<{ count: number }>();
    assert.equal(refund?.count, 1);
  } finally {
    await miniflare.dispose();
  }
});
