import type { Env } from "./env.js";

const ALERT_KEY = "billing-health";
const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;
type AlertDeliveryKind = "alert" | "reminder" | "recovery" | "test";

export interface OperationalHealth {
  healthy: boolean;
  failedBillingEvents: number;
  staleBillingEvents: number;
  openBillingReviews: number;
  outstandingLossReviews: number;
}

export interface OperationalAlertState {
  status: "healthy" | "unhealthy";
  fingerprint: string;
  lastCheckedAt: string | null;
  lastAttemptAt: string | null;
  lastSentAt: string | null;
  lastRecoveredAt: string | null;
  lastError: string | null;
}

interface OperationalAlertStateRow {
  status: "healthy" | "unhealthy";
  fingerprint: string;
  last_checked_at: string | null;
  last_attempt_at: string | null;
  last_sent_at: string | null;
  last_recovered_at: string | null;
  last_error: string | null;
}

function alertConfigured(env: Env) {
  return Boolean(env.OPS_ALERT_EMAIL && env.OPS_ALERT_TO?.trim() && env.OPS_ALERT_FROM?.trim());
}

export function operationalAlertConfigured(env: Env) {
  return alertConfigured(env);
}

export async function collectOperationalHealth(env: Env, at = new Date()): Promise<OperationalHealth> {
  const [eventHealth, reviewHealth] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_events,
      SUM(CASE WHEN status = 'processing' AND processing_started_at < ? THEN 1 ELSE 0 END) AS stale_events
      FROM billing_events`)
      .bind(new Date(at.getTime() - 15 * 60 * 1000).toISOString())
      .first<{ failed_events: number | null; stale_events: number | null }>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_reviews,
      SUM(CASE
        WHEN status = 'resolved'
          AND decision = 'confirmed_loss'
          AND unrecovered_credits > 0
        THEN 1 ELSE 0
      END) AS outstanding_loss_reviews
      FROM billing_reviews`)
      .first<{ open_reviews: number | null; outstanding_loss_reviews: number | null }>(),
  ]);

  const health = {
    failedBillingEvents: Number(eventHealth?.failed_events || 0),
    staleBillingEvents: Number(eventHealth?.stale_events || 0),
    openBillingReviews: Number(reviewHealth?.open_reviews || 0),
    outstandingLossReviews: Number(reviewHealth?.outstanding_loss_reviews || 0),
  };
  return {
    healthy: Object.values(health).every((value) => value === 0),
    ...health,
  };
}

export async function readOperationalAlertState(env: Env): Promise<OperationalAlertState | null> {
  const row = await env.DB.prepare(`SELECT status, fingerprint, last_checked_at,
      last_attempt_at, last_sent_at, last_recovered_at, last_error
    FROM operational_alert_state WHERE alert_key = ?`)
    .bind(ALERT_KEY)
    .first<OperationalAlertStateRow>();
  if (!row) return null;
  return {
    status: row.status,
    fingerprint: row.fingerprint,
    lastCheckedAt: row.last_checked_at,
    lastAttemptAt: row.last_attempt_at,
    lastSentAt: row.last_sent_at,
    lastRecoveredAt: row.last_recovered_at,
    lastError: row.last_error,
  };
}

function healthFingerprint(health: OperationalHealth) {
  return JSON.stringify({
    failedBillingEvents: health.failedBillingEvents,
    staleBillingEvents: health.staleBillingEvents,
    openBillingReviews: health.openBillingReviews,
    outstandingLossReviews: health.outstandingLossReviews,
  });
}

function alertText(env: Env, health: OperationalHealth, kind: AlertDeliveryKind, timestamp: string) {
  const lines = [
    `Environment: ${env.APP_BASE_URL}`,
    `Observed at: ${timestamp}`,
    `Revision: ${env.CF_VERSION_METADATA?.id || env.DEPLOY_REVISION || "unversioned"}`,
  ];
  if (kind === "recovery") {
    lines.push("All monitored Stripe event and billing review counters have returned to zero.");
  } else {
    if (kind === "test") {
      lines.push("This is an operator-requested delivery test. It does not represent a new billing incident.");
    }
    lines.push(
      `Failed Stripe events: ${health.failedBillingEvents}`,
      `Stale Stripe events: ${health.staleBillingEvents}`,
      `Open billing reviews: ${health.openBillingReviews}`,
      `Confirmed losses with unrecovered credits: ${health.outstandingLossReviews}`,
      `Review: ${env.APP_BASE_URL.replace(/\/$/, "")}/api/health`,
    );
  }
  return lines.join("\n");
}

async function deliverEmail(
  env: Env,
  health: OperationalHealth,
  kind: AlertDeliveryKind,
  timestamp: string,
) {
  if (!env.OPS_ALERT_EMAIL || !env.OPS_ALERT_TO?.trim() || !env.OPS_ALERT_FROM?.trim()) {
    throw new Error("Operational alert email is not configured.");
  }
  const subject = kind === "test"
    ? "[Test] Qwen Image operational alert delivery"
    : kind === "recovery"
    ? "[Recovered] Qwen Image billing health"
    : kind === "reminder"
      ? "[Reminder] Qwen Image billing health degraded"
      : "[Action required] Qwen Image billing health degraded";
  await env.OPS_ALERT_EMAIL.send({
    from: { email: env.OPS_ALERT_FROM.trim(), name: "Qwen Image Operations" },
    to: env.OPS_ALERT_TO.trim(),
    subject,
    text: alertText(env, health, kind, timestamp),
  });
  return subject;
}

async function recordDelivery(
  env: Env,
  input: {
    id: string;
    kind: AlertDeliveryKind;
    status: "sending" | "delivered" | "failed";
    fingerprint: string;
    subject: string;
    error: string | null;
    timestamp: string;
  },
) {
  await env.DB.prepare(`INSERT INTO operational_alert_deliveries
    (id, alert_key, kind, status, fingerprint, subject, error, created_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      input.id,
      ALERT_KEY,
      input.kind,
      input.status,
      input.fingerprint,
      input.subject,
      input.error,
      input.timestamp,
      input.status === "delivered" ? input.timestamp : null,
    )
    .run();
}

export async function sendOperationalAlertTest(
  env: Env,
  input: { operatorId: string; idempotencyKey: string },
  at = new Date(),
) {
  const health = await collectOperationalHealth(env, at);
  if (!alertConfigured(env)) {
    return {
      configured: false,
      delivered: false,
      replayed: false,
      health,
      error: "Operational alert email is not configured.",
    };
  }

  const timestamp = at.toISOString();
  const fingerprint = healthFingerprint(health);
  const subject = "[Test] Qwen Image operational alert delivery";
  const deliveryId = crypto.randomUUID();
  const claimed = await env.DB.prepare(`INSERT OR IGNORE INTO operational_alert_deliveries
    (id, alert_key, kind, status, fingerprint, subject, operator_id,
      idempotency_key, created_at)
    VALUES (?, ?, 'test', 'sending', ?, ?, ?, ?, ?)`)
    .bind(
      deliveryId,
      ALERT_KEY,
      fingerprint,
      subject,
      input.operatorId,
      input.idempotencyKey,
      timestamp,
    )
    .run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare(`SELECT status, error
      FROM operational_alert_deliveries
      WHERE kind = 'test' AND idempotency_key = ?`)
      .bind(input.idempotencyKey)
      .first<{ status: "sending" | "delivered" | "failed"; error: string | null }>();
    return {
      configured: true,
      delivered: existing?.status === "delivered",
      replayed: true,
      inProgress: existing?.status === "sending",
      health,
      error: existing?.error ?? null,
    };
  }

  try {
    await deliverEmail(env, health, "test", timestamp);
    await env.DB.prepare(`UPDATE operational_alert_deliveries
      SET status = 'delivered', delivered_at = ?, error = NULL
      WHERE id = ? AND status = 'sending'`)
      .bind(timestamp, deliveryId)
      .run();
    return { configured: true, delivered: true, replayed: false, health };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Operational alert delivery failed.";
    await env.DB.prepare(`UPDATE operational_alert_deliveries
      SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'`)
      .bind(message.slice(0, 500), deliveryId)
      .run();
    console.error("operational-alert-test-failed", { reason: message });
    return {
      configured: true,
      delivered: false,
      replayed: false,
      health,
      error: message,
    };
  }
}

export async function runOperationalAlerting(env: Env, at = new Date()) {
  const timestamp = at.toISOString();
  const health = await collectOperationalHealth(env, at);
  const fingerprint = healthFingerprint(health);
  const previous = await readOperationalAlertState(env);
  const previousSentAt = previous?.lastSentAt ? Date.parse(previous.lastSentAt) : Number.NaN;
  const reminderDue = !Number.isFinite(previousSentAt)
    || at.getTime() - previousSentAt >= REMINDER_INTERVAL_MS;
  const recoveryDue = health.healthy && previous?.status === "unhealthy";
  const alertDue = !health.healthy && (
    previous?.status !== "unhealthy"
    || previous.fingerprint !== fingerprint
    || reminderDue
  );

  if (!alertConfigured(env)) {
    await env.DB.prepare(`UPDATE operational_alert_state
      SET status = ?, fingerprint = ?, last_checked_at = ?, updated_at = ?
      WHERE alert_key = ?`)
      .bind(health.healthy ? "healthy" : "unhealthy", fingerprint, timestamp, timestamp, ALERT_KEY)
      .run();
    return { configured: false, delivered: false, health };
  }

  if (!alertDue && !recoveryDue) {
    await env.DB.prepare(`UPDATE operational_alert_state
      SET last_checked_at = ?, updated_at = ? WHERE alert_key = ?`)
      .bind(timestamp, timestamp, ALERT_KEY)
      .run();
    return { configured: true, delivered: false, health };
  }

  const kind: "alert" | "reminder" | "recovery" = recoveryDue
    ? "recovery"
    : previous?.status === "unhealthy" && previous.lastSentAt
      ? "reminder"
      : "alert";
  const deliveryId = crypto.randomUUID();
  const expectedSubject = kind === "recovery"
    ? "[Recovered] Qwen Image billing health"
    : kind === "reminder"
      ? "[Reminder] Qwen Image billing health degraded"
      : "[Action required] Qwen Image billing health degraded";

  await env.DB.prepare(`UPDATE operational_alert_state
    SET last_checked_at = ?, last_attempt_at = ?, updated_at = ?
    WHERE alert_key = ?`)
    .bind(timestamp, timestamp, timestamp, ALERT_KEY)
    .run();

  try {
    const subject = await deliverEmail(env, health, kind, timestamp);
    await env.DB.batch([
      env.DB.prepare(`UPDATE operational_alert_state
        SET status = ?, fingerprint = ?, last_sent_at = ?,
          last_recovered_at = ?, last_error = NULL, updated_at = ?
        WHERE alert_key = ?`)
        .bind(
          health.healthy ? "healthy" : "unhealthy",
          fingerprint,
          timestamp,
          kind === "recovery" ? timestamp : previous?.lastRecoveredAt ?? null,
          timestamp,
          ALERT_KEY,
        ),
      env.DB.prepare(`INSERT INTO operational_alert_deliveries
        (id, alert_key, kind, status, fingerprint, subject, created_at, delivered_at)
        VALUES (?, ?, ?, 'delivered', ?, ?, ?, ?)`)
        .bind(deliveryId, ALERT_KEY, kind, fingerprint, subject, timestamp, timestamp),
    ]);
    return { configured: true, delivered: true, kind, health };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Operational alert delivery failed.";
    await recordDelivery(env, {
      id: deliveryId,
      kind,
      status: "failed",
      fingerprint,
      subject: expectedSubject,
      error: message,
      timestamp,
    });
    await env.DB.prepare(`UPDATE operational_alert_state
      SET status = 'unhealthy', last_error = ?, updated_at = ?
      WHERE alert_key = ?`)
      .bind(message.slice(0, 500), timestamp, ALERT_KEY)
      .run();
    console.error("operational-alert-delivery-failed", { kind, reason: message });
    return { configured: true, delivered: false, kind, health, error: message };
  }
}
