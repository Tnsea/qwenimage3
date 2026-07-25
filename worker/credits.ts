/// <reference types="@cloudflare/workers-types" />

import type { CreditEntry } from "../src/types.js";

interface CreditMutationInput {
  userId: string;
  amount: number;
  type: CreditEntry["type"];
  referenceId: string;
  description: string;
  timestamp?: string;
}

export interface PreparedCreditMutation {
  ledgerId: string;
  statements: D1PreparedStatement[];
}

function changes(result: D1Result<unknown> | undefined) {
  return result?.meta.changes ?? 0;
}

export function prepareCreditReservation(
  db: D1Database,
  input: { userId: string; amount: number; referenceId: string; timestamp?: string },
): PreparedCreditMutation {
  const ledgerId = crypto.randomUUID();
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    ledgerId,
    statements: [
      db.prepare(`INSERT OR IGNORE INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        SELECT ?, ca.user_id, 'generation_reservation', ?, ca.available - ?, ?, 'Generation credit reservation', ?
        FROM credit_accounts ca
        JOIN billing_accounts ba ON ba.user_id = ca.user_id
        WHERE ca.user_id = ? AND ca.available >= ? AND ba.spending_blocked = 0`)
        .bind(ledgerId, -input.amount, input.amount, input.referenceId, timestamp, input.userId, input.amount),
      db.prepare(`UPDATE credit_accounts
        SET available = available - ?, reserved = reserved + ?, updated_at = ?
        WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)`)
        .bind(input.amount, input.amount, timestamp, input.userId, ledgerId),
    ],
  };
}

export function prepareCreditGrant(db: D1Database, input: CreditMutationInput): PreparedCreditMutation {
  const ledgerId = crypto.randomUUID();
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    ledgerId,
    statements: [
      db.prepare(`INSERT OR IGNORE INTO credit_ledger
        (id, user_id, type, amount, balance_after, reference_id, description, created_at)
        SELECT ?, ca.user_id, ?, ?, ca.available + ?, ?, ?, ?
        FROM credit_accounts ca WHERE ca.user_id = ?`)
        .bind(
          ledgerId,
          input.type,
          input.amount,
          input.amount,
          input.referenceId,
          input.description,
          timestamp,
          input.userId,
        ),
      db.prepare(`UPDATE credit_accounts
        SET available = available + ?, updated_at = ?
        WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)`)
        .bind(input.amount, timestamp, input.userId, ledgerId),
    ],
  };
}

export function creditMutationApplied(results: D1Result<unknown>[], offset = 0) {
  const inserted = changes(results[offset]);
  const updated = changes(results[offset + 1]);
  if (inserted === 0) return false;
  if (inserted !== 1 || updated !== 1) {
    throw new Error(`Credit mutation invariant failed: inserted=${inserted}, updated=${updated}.`);
  }
  return true;
}

export async function grantCredits(db: D1Database, input: CreditMutationInput) {
  const prepared = prepareCreditGrant(db, input);
  const results = await db.batch(prepared.statements);
  return creditMutationApplied(results);
}

async function finishReservation(
  db: D1Database,
  input: {
    userId: string;
    amount: number;
    referenceId: string;
    kind: "settlement" | "refund";
    timestamp?: string;
  },
) {
  const ledgerId = crypto.randomUUID();
  const timestamp = input.timestamp ?? new Date().toISOString();
  const isRefund = input.kind === "refund";
  const type: CreditEntry["type"] = isRefund ? "generation_refund" : "generation_settlement";
  const amount = isRefund ? input.amount : 0;
  const description = isRefund ? "Failed generation credit restoration" : "Generation completed";
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO credit_ledger
      (id, user_id, type, amount, balance_after, reference_id, description, created_at)
      SELECT ?, ca.user_id, ?, ?, ca.available + ?, ?, ?, ?
      FROM credit_accounts ca
      WHERE ca.user_id = ? AND ca.reserved >= ?
        AND EXISTS (
          SELECT 1 FROM credit_ledger r
          WHERE r.user_id = ca.user_id
            AND r.type = 'generation_reservation'
            AND r.reference_id = ?
        )`)
      .bind(
        ledgerId,
        type,
        amount,
        isRefund ? input.amount : 0,
        input.referenceId,
        description,
        timestamp,
        input.userId,
        input.amount,
        input.referenceId,
      ),
    db.prepare(`UPDATE credit_accounts
      SET available = available + ?, reserved = reserved - ?, updated_at = ?
      WHERE user_id = ? AND EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)`)
      .bind(isRefund ? input.amount : 0, input.amount, timestamp, input.userId, ledgerId),
  ]);
  return creditMutationApplied(results);
}

export function settleCredits(
  db: D1Database,
  input: { userId: string; amount: number; referenceId: string; timestamp?: string },
) {
  return finishReservation(db, { ...input, kind: "settlement" });
}

export function refundCredits(
  db: D1Database,
  input: { userId: string; amount: number; referenceId: string; timestamp?: string },
) {
  return finishReservation(db, { ...input, kind: "refund" });
}
