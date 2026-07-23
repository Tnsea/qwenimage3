/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { BILLING_TERMS_VERSION } from "../src/billing-policy.js";
import { runOperationalAlerting } from "../worker/alerting.js";
import worker from "../worker/index.js";
import { hashToken } from "../worker/security.js";

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
    const sql = (await readFile(`worker/migrations/${file}`, "utf8"))
      .replace(/^PRAGMA foreign_keys = ON;\s*/m, "");
    for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
  const timestamp = "2026-07-23T12:00:00.000Z";
  const sessionToken = "billing-policy-session-token";
  await database.batch([
    database.prepare(`INSERT INTO users
      (id, name, email_normalized, password_hash, email_verified_at, created_at, updated_at)
      VALUES ('policy-user', 'Policy User', 'policy@example.com', 'test-hash', ?, ?, ?)`)
      .bind(timestamp, timestamp, timestamp),
    database.prepare(`INSERT INTO credit_accounts
      (user_id, available, reserved, updated_at) VALUES ('policy-user', 20, 0, ?)`)
      .bind(timestamp),
    database.prepare("INSERT INTO billing_accounts (user_id, updated_at) VALUES ('policy-user', ?)")
      .bind(timestamp),
    database.prepare(`INSERT INTO sessions
      (id, user_id, token_hash, user_agent, ip_hint, expires_at, last_seen_at, created_at)
      VALUES ('policy-session', 'policy-user', ?, 'Policy test', '127.0.0.*',
        '2027-07-23T12:00:00.000Z', ?, ?)`)
      .bind(await hashToken(sessionToken), timestamp, timestamp),
  ]);
  return { miniflare, database, sessionToken };
}

function workerEnvironment(database: D1Database) {
  return {
    DB: database,
    APP_BASE_URL: "https://qwen-image-3.net",
    BILLING_ENABLED: "true",
    GENERATION_PROVIDER: "local",
    QWEN_MODEL_ID: "local-qwen-preview",
    STRIPE_SECRET_KEY: "rk_test_policy",
    STRIPE_WEBHOOK_SECRET: "whsec_policy",
    STRIPE_PRICE_STARTER_MONTHLY: "price_1TwMSWHyVvkt92TEJXyOtAjU",
  };
}

const executionContext = {
  passThroughOnException() {},
  waitUntil() {},
};

function authenticatedRequest(path: string, sessionToken: string, init: RequestInit = {}) {
  return new Request(`https://qwen-image-3.net${path}`, {
    ...init,
    headers: {
      Cookie: `qwen_session=${sessionToken}`,
      Origin: "https://qwen-image-3.net",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

test("Checkout requires a server-recorded acceptance of the current billing policy", async () => {
  const { miniflare, database, sessionToken } = await createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const environment = workerEnvironment(database);
    const signedOutAcceptance = await worker.fetch(
      new Request("https://qwen-image-3.net/api/billing/terms/accept", {
        method: "POST",
        headers: {
          Origin: "https://qwen-image-3.net",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: BILLING_TERMS_VERSION, confirmed: true }),
      }),
      environment as never,
      executionContext as never,
    );
    assert.equal(signedOutAcceptance.status, 401);
    assert.equal(
      (await signedOutAcceptance.json() as { error: { code: string } }).error.code,
      "UNAUTHENTICATED",
    );

    const initialBilling = await worker.fetch(
      authenticatedRequest("/api/billing", sessionToken),
      environment as never,
      executionContext as never,
    );
    const initialBody = await initialBilling.json() as {
      terms: { version: string; accepted: boolean; acceptedAt: string | null };
    };
    assert.deepEqual(initialBody.terms, {
      version: BILLING_TERMS_VERSION,
      accepted: false,
      acceptedAt: null,
    });

    const blockedCheckout = await worker.fetch(
      authenticatedRequest("/api/billing/checkout", sessionToken, {
        method: "POST",
        body: JSON.stringify({ offerId: "starter_monthly" }),
      }),
      environment as never,
      executionContext as never,
    );
    assert.equal(blockedCheckout.status, 409);
    assert.equal((await blockedCheckout.json() as { error: { code: string } }).error.code, "BILLING_TERMS_REQUIRED");

    const acceptance = await worker.fetch(
      authenticatedRequest("/api/billing/terms/accept", sessionToken, {
        method: "POST",
        body: JSON.stringify({ version: BILLING_TERMS_VERSION, confirmed: true }),
      }),
      environment as never,
      executionContext as never,
    );
    assert.equal(acceptance.status, 200);
    const acceptedBody = await acceptance.json() as { accepted: boolean; acceptedAt: string; version: string };
    assert.equal(acceptedBody.accepted, true);
    assert.equal(acceptedBody.version, BILLING_TERMS_VERSION);

    const invalidAcceptance = await worker.fetch(
      authenticatedRequest("/api/billing/terms/accept", sessionToken, {
        method: "POST",
        body: JSON.stringify({ version: "obsolete", confirmed: true }),
      }),
      environment as never,
      executionContext as never,
    );
    assert.equal(invalidAcceptance.status, 400);

    const stripeBodies: URLSearchParams[] = [];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = new URLSearchParams(String(init?.body ?? ""));
      stripeBodies.push(body);
      if (url.endsWith("/v1/customers")) {
        return new Response(JSON.stringify({ id: "cus_policy" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/v1/checkout/sessions")) {
        return new Response(JSON.stringify({
          id: "cs_policy",
          url: "https://checkout.stripe.com/c/pay/cs_policy",
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    const checkout = await worker.fetch(
      authenticatedRequest("/api/billing/checkout", sessionToken, {
        method: "POST",
        body: JSON.stringify({ offerId: "starter_monthly" }),
      }),
      environment as never,
      executionContext as never,
    );
    assert.equal(checkout.status, 201);
    const checkoutBody = stripeBodies.find((body) => body.get("mode") === "subscription");
    assert.equal(checkoutBody?.get("metadata[terms_version]"), BILLING_TERMS_VERSION);
    assert.equal(checkoutBody?.get("subscription_data[metadata][terms_version]"), BILLING_TERMS_VERSION);
    const attempt = await database.prepare(`SELECT terms_version, terms_accepted_at
      FROM billing_checkout_attempts WHERE id = 'cs_policy' OR stripe_checkout_session_id = 'cs_policy'`)
      .first<{ terms_version: string; terms_accepted_at: string }>();
    assert.equal(attempt?.terms_version, BILLING_TERMS_VERSION);
    assert.equal(attempt?.terms_accepted_at, acceptedBody.acceptedAt);
  } finally {
    globalThis.fetch = originalFetch;
    await miniflare.dispose();
  }
});

test("scheduled billing alerts deduplicate incidents, remind, and send recovery externally", async () => {
  const { miniflare, database } = await createDatabase();
  const sent: Array<{ subject: string; text?: string; to?: unknown }> = [];
  try {
    await database.prepare(`INSERT INTO billing_events
      (stripe_event_id, type, status, attempts, payload_json, last_error,
        processing_started_at, updated_at)
      VALUES ('evt_alert', 'invoice.payment_failed', 'failed', 1, '{}',
        'Synthetic alert test', '2026-07-23T12:00:00.000Z', '2026-07-23T12:00:00.000Z')`)
      .run();
    const environment = {
      ...workerEnvironment(database),
      BILLING_OPERATOR_TOKEN: "policy-alert-operator-token-32-characters",
      OPS_ALERT_TO: "verified-ops@example.com",
      OPS_ALERT_FROM: "alerts@qwen-image-3.net",
      OPS_ALERT_EMAIL: {
        async send(message: EmailMessageBuilder) {
          sent.push({ subject: message.subject, text: message.text, to: message.to });
          return { messageId: `message-${sent.length}` };
        },
      },
    };

    const unconfigured = await runOperationalAlerting(
      {
        ...environment,
        OPS_ALERT_EMAIL: undefined,
        OPS_ALERT_TO: undefined,
        OPS_ALERT_FROM: undefined,
      } as never,
      new Date("2026-07-23T12:10:00.000Z"),
    );
    assert.equal(unconfigured.configured, false);
    assert.equal(unconfigured.delivered, false);

    const first = await runOperationalAlerting(environment as never, new Date("2026-07-23T12:15:00.000Z"));
    assert.equal(first.delivered, true);
    assert.equal(first.kind, "alert");
    assert.equal(sent.length, 1);
    assert.match(sent[0].subject, /Action required/);
    assert.match(sent[0].text ?? "", /Failed Stripe events: 1/);
    assert.doesNotMatch(sent[0].text ?? "", /policy@example\.com/);

    const duplicate = await runOperationalAlerting(environment as never, new Date("2026-07-23T12:30:00.000Z"));
    assert.equal(duplicate.delivered, false);
    assert.equal(sent.length, 1);

    const reminder = await runOperationalAlerting(environment as never, new Date("2026-07-23T18:16:00.000Z"));
    assert.equal(reminder.delivered, true);
    assert.equal(reminder.kind, "reminder");
    assert.equal(sent.length, 2);

    await database.prepare(`UPDATE billing_events
      SET status = 'completed', completed_at = '2026-07-23T18:20:00.000Z',
        updated_at = '2026-07-23T18:20:00.000Z'
      WHERE stripe_event_id = 'evt_alert'`)
      .run();
    const recovery = await runOperationalAlerting(environment as never, new Date("2026-07-23T18:30:00.000Z"));
    assert.equal(recovery.delivered, true);
    assert.equal(recovery.kind, "recovery");
    assert.equal(sent.length, 3);
    assert.match(sent[2].subject, /Recovered/);

    const deniedTest = await worker.fetch(
      new Request("https://qwen-image-3.net/api/operator/alerts/test", {
        method: "POST",
        headers: {
          Origin: "https://qwen-image-3.net",
          Authorization: "Bearer invalid",
          "X-Operator-Id": "acceptance@example.com",
          "Idempotency-Key": "alert-test-20260723",
        },
      }),
      environment as never,
      executionContext as never,
    );
    assert.equal(deniedTest.status, 401);

    const alertTestRequest = () => new Request("https://qwen-image-3.net/api/operator/alerts/test", {
      method: "POST",
      headers: {
        Origin: "https://qwen-image-3.net",
        Authorization: `Bearer ${environment.BILLING_OPERATOR_TOKEN}`,
        "X-Operator-Id": "acceptance@example.com",
        "Idempotency-Key": "alert-test-20260723",
      },
    });
    const testDelivery = await worker.fetch(
      alertTestRequest(),
      environment as never,
      executionContext as never,
    );
    assert.equal(testDelivery.status, 200);
    assert.equal((await testDelivery.json() as { delivered: boolean; replayed: boolean }).delivered, true);
    assert.equal(sent.length, 4);
    assert.match(sent[3].subject, /\[Test\]/);
    assert.match(sent[3].text ?? "", /operator-requested delivery test/);

    const replayedTest = await worker.fetch(
      alertTestRequest(),
      environment as never,
      executionContext as never,
    );
    assert.equal(replayedTest.status, 200);
    assert.equal((await replayedTest.json() as { replayed: boolean }).replayed, true);
    assert.equal(sent.length, 4);

    const deliveries = await database.prepare(`SELECT kind, status
      FROM operational_alert_deliveries
      ORDER BY CASE kind
        WHEN 'alert' THEN 1
        WHEN 'reminder' THEN 2
        WHEN 'recovery' THEN 3
        WHEN 'test' THEN 4
        ELSE 5
      END`).all<{ kind: string; status: string }>();
    assert.deepEqual(deliveries.results, [
      { kind: "alert", status: "delivered" },
      { kind: "reminder", status: "delivered" },
      { kind: "recovery", status: "delivered" },
      { kind: "test", status: "delivered" },
    ]);
  } finally {
    await miniflare.dispose();
  }
});
