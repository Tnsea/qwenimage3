/// <reference types="@cloudflare/workers-types" />

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import worker from "../worker/index.js";

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
  return { miniflare, database };
}

const executionContext = {
  passThroughOnException() {},
  waitUntil() {},
};

function environment(database: D1Database) {
  return {
    APP_BASE_URL: "https://qwen-image-3.net",
    BILLING_ENABLED: "false",
    GENERATION_PROVIDER: "local",
    QWEN_MODEL_ID: "local-qwen-preview",
    FREE_QUEUE_DELAY_MS: "0",
    DB: database,
    ASSETS: { fetch: () => Promise.resolve(new Response("not used")) },
    ASSETS_BUCKET: {},
  };
}

async function json<T>(response: Response) {
  return response.json() as Promise<T>;
}

test("canonical Worker requires an account and grants 20 welcome credits exactly once", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const env = environment(database);
    const session = await worker.fetch(
      new Request("https://qwen-image-3.net/api/session"),
      env as never,
      executionContext as never,
    );
    const sessionBody = await json<{
      user: null;
      entitlements: { guestRemaining: number };
    }>(session);
    assert.equal(session.status, 200);
    assert.equal(sessionBody.user, null);
    assert.equal(sessionBody.entitlements.guestRemaining, 0);
    assert.doesNotMatch(session.headers.get("set-cookie") ?? "", /qwen_guest=/);

    const blocked = await worker.fetch(
      new Request("https://qwen-image-3.net/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://qwen-image-3.net" },
        body: JSON.stringify({
          prompt: "A signed-out request must never reach the provider",
          aspectRatio: "1:1",
          style: "Photorealistic",
          quality: "Standard",
        }),
      }),
      env as never,
      executionContext as never,
    );
    assert.equal(blocked.status, 401);
    assert.equal((await json<{ error: { code: string } }>(blocked)).error.code, "UNAUTHENTICATED");
    assert.equal((await database.prepare("SELECT COUNT(*) count FROM generations").first<{ count: number }>())?.count, 0);

    const register = await worker.fetch(
      new Request("https://qwen-image-3.net/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://qwen-image-3.net" },
        body: JSON.stringify({ name: "Starter User", email: "starter@example.com", password: "Launch1234" }),
      }),
      env as never,
      executionContext as never,
    );
    const registered = await json<{
      user: { emailVerified: boolean };
      entitlements: { credits: number };
    }>(register);
    assert.equal(register.status, 201);
    assert.equal(registered.user.emailVerified, false);
    assert.equal(registered.entitlements.credits, 20);
    const sessionCookie = (register.headers.get("set-cookie") ?? "").split(";")[0];

    const login = () => worker.fetch(
      new Request("https://qwen-image-3.net/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://qwen-image-3.net" },
        body: JSON.stringify({ email: "starter@example.com", password: "Launch1234" }),
      }),
      env as never,
      executionContext as never,
    );
    assert.equal((await json<{ entitlements: { credits: number } }>(await login())).entitlements.credits, 20);
    assert.equal((await json<{ entitlements: { credits: number } }>(await login())).entitlements.credits, 20);

    const grantRows = await database.prepare(
      "SELECT COUNT(*) count FROM credit_ledger WHERE type = 'signup_grant'",
    ).first<{ count: number }>();
    assert.equal(grantRows?.count, 1);

    await database.prepare(`UPDATE billing_accounts
      SET plan = 'creator', plan_tier = 'starter', billing_interval = 'month', status = 'active'
      WHERE user_id = (SELECT id FROM users WHERE email_normalized = 'starter@example.com')`).run();
    const starterSession = await worker.fetch(
      new Request("https://qwen-image-3.net/api/session", { headers: { Cookie: sessionCookie } }),
      env as never,
      executionContext as never,
    );
    assert.deepEqual(
      (await json<{ entitlements: { priorityGeneration: boolean; watermarkedExports: boolean } }>(starterSession)).entitlements,
      {
        accountType: "creator",
        guestLimit: 0,
        guestRemaining: 0,
        credits: 20,
        reservedCredits: 0,
        guestResetsAt: "",
        priorityGeneration: false,
        watermarkedExports: false,
      },
    );

    await database.prepare(`UPDATE billing_accounts
      SET plan_tier = 'creator'
      WHERE user_id = (SELECT id FROM users WHERE email_normalized = 'starter@example.com')`).run();
    const creatorSession = await worker.fetch(
      new Request("https://qwen-image-3.net/api/session", { headers: { Cookie: sessionCookie } }),
      env as never,
      executionContext as never,
    );
    const creatorEntitlements = (await json<{ entitlements: { priorityGeneration: boolean; watermarkedExports: boolean } }>(creatorSession)).entitlements;
    assert.equal(creatorEntitlements.priorityGeneration, true);
    assert.equal(creatorEntitlements.watermarkedExports, false);
  } finally {
    await miniflare.dispose();
  }
});
