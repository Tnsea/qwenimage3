/// <reference types="@cloudflare/workers-types" />

import { refundCredits, settleCredits } from "./credits.js";
import type { Env } from "./env.js";

export interface MaintenanceStripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

type StripeEventHandler = (env: Env, event: MaintenanceStripeEvent) => Promise<void>;

function now() {
  return new Date().toISOString();
}

async function retryFailedBillingEvents(env: Env, handleStripeEvent: StripeEventHandler) {
  const failed = await env.DB.prepare(`SELECT stripe_event_id, payload_json FROM billing_events
    WHERE status = 'failed' AND attempts < 8 ORDER BY updated_at ASC LIMIT 10`)
    .all<{ stripe_event_id: string; payload_json: string }>();
  let completed = 0;
  for (const row of failed.results) {
    const claimed = await env.DB.prepare(`UPDATE billing_events SET status = 'processing', attempts = attempts + 1,
      last_error = NULL, processing_started_at = ?, updated_at = ?
      WHERE stripe_event_id = ? AND status = 'failed'`)
      .bind(now(), now(), row.stripe_event_id).run();
    if (!claimed.meta.changes) continue;
    try {
      const event = JSON.parse(row.payload_json) as MaintenanceStripeEvent;
      if (event.id !== row.stripe_event_id || !event.type || !event.data?.object) {
        throw new Error("Stored Stripe event is incomplete.");
      }
      await handleStripeEvent(env, event);
      await env.DB.prepare(`UPDATE billing_events SET status = 'completed', completed_at = ?, updated_at = ?
        WHERE stripe_event_id = ?`).bind(now(), now(), row.stripe_event_id).run();
      completed += 1;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Stripe event could not be retried.";
      await env.DB.prepare(`UPDATE billing_events SET status = 'failed', last_error = ?, updated_at = ?
        WHERE stripe_event_id = ?`).bind(message, now(), row.stripe_event_id).run();
    }
  }
  return completed;
}

export async function runMaintenance(env: Env, handleStripeEvent: StripeEventHandler) {
  const runId = crypto.randomUUID();
  const timestamp = now();
  const guestCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const processingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await env.DB.prepare(`INSERT INTO maintenance_runs (id, status, started_at)
    VALUES (?, 'running', ?)`)
    .bind(runId, timestamp)
    .run();
  let guestAssetsDeleted = 0;
  let staleRecovered = 0;
  let completedSettled = 0;
  let billingRetried = 0;
  try {
    billingRetried = await retryFailedBillingEvents(env, handleStripeEvent);
    const queuedDeletions = await env.DB.prepare(`SELECT object_key FROM r2_deletion_queue
      WHERE attempts < 12 ORDER BY updated_at ASC LIMIT 100`)
      .all<{ object_key: string }>();
    for (const queued of queuedDeletions.results) {
      try {
        await env.ASSETS_BUCKET.delete(queued.object_key);
        await env.DB.prepare("DELETE FROM r2_deletion_queue WHERE object_key = ?")
          .bind(queued.object_key)
          .run();
      } catch (reason) {
        await env.DB.prepare(`UPDATE r2_deletion_queue
          SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE object_key = ?`)
          .bind(reason instanceof Error ? reason.message : "R2 deletion failed.", now(), queued.object_key)
          .run();
      }
    }

    const guestAssets = await env.DB.prepare("SELECT id, r2_key FROM generations WHERE anonymous_session_id IS NOT NULL AND created_at < ?")
      .bind(guestCutoff).all<{ id: string; r2_key: string | null }>();
    await Promise.all(guestAssets.results.flatMap((row) => row.r2_key ? [env.ASSETS_BUCKET.delete(row.r2_key)] : []));
    if (guestAssets.results.length) {
      await env.DB.batch(guestAssets.results.map((row) => env.DB.prepare("DELETE FROM generations WHERE id = ?").bind(row.id)));
      guestAssetsDeleted = guestAssets.results.length;
    }

    const stale = await env.DB.prepare(`SELECT id, owner_user_id, anonymous_session_id, credit_cost, created_at
      FROM generations WHERE status = 'processing' AND updated_at < ?`)
      .bind(processingCutoff)
      .all<{ id: string; owner_user_id: string | null; anonymous_session_id: string | null; credit_cost: number; created_at: string }>();
    for (const generation of stale.results) {
      const failed = await env.DB.prepare("UPDATE generations SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'processing'")
        .bind(timestamp, generation.id)
        .run();
      if ((failed.meta.changes ?? 0) !== 1) continue;
      if (generation.owner_user_id) {
        await refundCredits(env.DB, {
          userId: generation.owner_user_id,
          amount: generation.credit_cost,
          referenceId: generation.id,
          timestamp,
        });
      } else if (generation.anonymous_session_id) {
        await env.DB.prepare(`UPDATE anonymous_sessions
          SET used_count = CASE WHEN quota_date = ? THEN MAX(0, used_count - 1) ELSE used_count END
          WHERE id = ?`)
          .bind(generation.created_at.slice(0, 10), generation.anonymous_session_id)
          .run();
      }
      await env.DB.prepare(`UPDATE generation_requests
        SET status = 'failed', failure_code = 'STALE_GENERATION', updated_at = ?
        WHERE generation_id = ? AND status IN ('claimed', 'processing')`)
        .bind(timestamp, generation.id)
        .run();
      staleRecovered += 1;
    }

    const completedReservations = await env.DB.prepare(`SELECT g.id, g.owner_user_id, g.credit_cost
      FROM generations g
      WHERE g.status = 'complete' AND g.owner_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM credit_ledger r
          WHERE r.user_id = g.owner_user_id
            AND r.type = 'generation_reservation'
            AND r.reference_id = g.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM credit_ledger s
          WHERE s.user_id = g.owner_user_id
            AND s.type IN ('generation_settlement', 'generation_refund')
            AND s.reference_id = g.id
        )`)
      .all<{ id: string; owner_user_id: string; credit_cost: number }>();
    for (const generation of completedReservations.results) {
      if (await settleCredits(env.DB, {
        userId: generation.owner_user_id,
        amount: generation.credit_cost,
        referenceId: generation.id,
        timestamp,
      })) {
        completedSettled += 1;
      }
      await env.DB.prepare("UPDATE generation_requests SET status = 'completed', updated_at = ? WHERE generation_id = ?")
        .bind(timestamp, generation.id)
        .run();
    }

    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(timestamp),
      env.DB.prepare("DELETE FROM security_tokens WHERE expires_at <= ? OR consumed_at IS NOT NULL").bind(timestamp),
      env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(timestamp),
      env.DB.prepare("DELETE FROM rate_limit_buckets WHERE reset_at <= ?").bind(Date.now()),
      env.DB.prepare("DELETE FROM idempotency_keys WHERE created_at < ?").bind(guestCutoff),
      env.DB.prepare("DELETE FROM generation_requests WHERE expires_at <= ? AND status IN ('completed', 'failed')").bind(timestamp),
      env.DB.prepare(`UPDATE generation_requests
        SET status = 'failed', failure_code = 'CLAIM_EXPIRED', updated_at = ?
        WHERE updated_at < ? AND status = 'claimed'`).bind(timestamp, processingCutoff),
      env.DB.prepare("DELETE FROM anonymous_sessions WHERE expires_at <= ?").bind(timestamp),
    ]);
    await env.DB.prepare(`UPDATE maintenance_runs
      SET status = 'completed', guest_assets_deleted = ?, stale_generations_recovered = ?,
        completed_reservations_settled = ?, failed_billing_events_retried = ?, completed_at = ?
      WHERE id = ?`)
      .bind(guestAssetsDeleted, staleRecovered, completedSettled, billingRetried, now(), runId)
      .run();
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Maintenance failed.";
    await env.DB.prepare(`UPDATE maintenance_runs
      SET status = 'failed', error_message = ?, guest_assets_deleted = ?,
        stale_generations_recovered = ?, completed_reservations_settled = ?,
        failed_billing_events_retried = ?, completed_at = ?
      WHERE id = ?`)
      .bind(message, guestAssetsDeleted, staleRecovered, completedSettled, billingRetried, now(), runId)
      .run();
    throw reason;
  }
}
