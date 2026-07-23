import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "qwen-maintenance-"));
process.env.DATABASE_PATH = join(testDirectory, "maintenance.db");

const db = await import("../server/db.js");

test("maintenance recovers stranded credits and deletes guest assets after 24 hours", () => {
  const started = new Date();
  const user = db.createUser({
    id: crypto.randomUUID(), name: "Recovery Test", email: "recovery@example.com", passwordHash: "unused",
    emailVerified: true, ledgerId: crypto.randomUUID(),
  });
  const userGenerationId = crypto.randomUUID();
  assert.equal(db.reserveCredits({ ledgerId: crypto.randomUUID(), userId: user.id, amount: 2, referenceId: userGenerationId }).reserved, true);
  db.createPending({
    id: userGenerationId, prompt: "A stranded signed-in generation", aspectRatio: "1:1", style: "Editorial", quality: "High",
    ownerUserId: user.id, anonymousSessionId: null, projectId: null, creditCost: 2,
  });

  const guestId = crypto.randomUUID();
  db.createAnonymousSession({ id: guestId, tokenHash: crypto.randomUUID(), quotaDate: started.toISOString().slice(0, 10), expiresAt: new Date(started.getTime() + 30 * 86_400_000).toISOString() });
  const guestGenerationId = crypto.randomUUID();
  db.createPending({
    id: guestGenerationId, prompt: "A temporary guest generation", aspectRatio: "1:1", style: "Cinematic", quality: "Standard",
    ownerUserId: null, anonymousSessionId: guestId, projectId: null, creditCost: 0,
  });

  const recovery = db.runMaintenance(new Date(started.getTime() + 11 * 60_000));
  assert.equal(recovery.failedStalled, 2);
  assert.equal(db.getCreditAccount(user.id).available, 20);
  assert.equal(db.getCreditAccount(user.id).reserved, 0);
  assert.equal(db.getGenerationRecord(userGenerationId)?.generation.status, "failed");
  assert.equal(db.listCreditLedger(user.id, 20).filter((entry) => entry.type === "generation_refund" && entry.referenceId === userGenerationId).length, 1);

  const retention = db.runMaintenance(new Date(started.getTime() + 25 * 60 * 60_000));
  assert.equal(retention.guestAssetsDeleted, 1);
  assert.equal(db.getGenerationRecord(guestGenerationId), null);
  assert.ok(db.maintenanceStatus()?.lastRunAt);
});

test("rate limits are persisted in SQLite buckets", () => {
  const now = Date.now();
  assert.equal(db.consumeRateLimit("test:shared", 2, 60_000, now).allowed, true);
  assert.equal(db.consumeRateLimit("test:shared", 2, 60_000, now + 1).allowed, true);
  assert.equal(db.consumeRateLimit("test:shared", 2, 60_000, now + 2).allowed, false);
  assert.equal(db.consumeRateLimit("test:shared", 2, 60_000, now + 60_001).allowed, true);
});
