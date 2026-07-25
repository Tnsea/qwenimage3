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

function environment(database: D1Database, assetsBucket: Partial<R2Bucket> = {}) {
  return {
    APP_BASE_URL: "https://qwen-image-3.net",
    BILLING_ENABLED: "false",
    GENERATION_PROVIDER: "local",
    QWEN_MODEL_ID: "local-qwen-preview",
    FREE_QUEUE_DELAY_MS: "0",
    DB: database,
    ASSETS: { fetch: () => Promise.resolve(new Response("not used")) },
    ASSETS_BUCKET: assetsBucket,
  };
}

async function json<T>(response: Response) {
  return response.json() as Promise<T>;
}

test("canonical Worker requires an account and grants 20 welcome credits exactly once", async () => {
  const { miniflare, database } = await createDatabase();
  try {
    const sourceBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const assetKey = "generations/users/starter/export.png";
    const env = environment(database, {
      get: async (key: string) => key === assetKey ? {
        arrayBuffer: async () => sourceBytes.slice().buffer,
        httpMetadata: { contentType: "image/png" },
      } as R2ObjectBody : null,
    });
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

    const user = await database.prepare(
      "SELECT id FROM users WHERE email_normalized = 'starter@example.com'",
    ).first<{ id: string }>();
    assert.ok(user);
    const generationId = "starter-export-generation";
    const createdAt = new Date().toISOString();
    await database.prepare(`INSERT INTO generations (
      id, owner_user_id, anonymous_session_id, project_id, prompt, aspect_ratio, style, quality,
      status, width, height, r2_key, mime_type, provider, model, credit_cost, queue_tier,
      queued_at, processing_started_at, favorite, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
      .bind(
        generationId,
        user.id,
        "A paid Starter export regression fixture",
        "1:1",
        "Photorealistic",
        "Standard",
        1,
        1,
        assetKey,
        "image/png",
        "local",
        "local-qwen-preview",
        4,
        "free",
        createdAt,
        createdAt,
        createdAt,
        createdAt,
      ).run();

    for (const suffix of ["b", "c"]) {
      await database.prepare(`INSERT INTO generations (
        id, owner_user_id, anonymous_session_id, project_id, prompt, aspect_ratio, style, quality,
        status, width, height, r2_key, mime_type, provider, model, credit_cost, queue_tier,
        queued_at, processing_started_at, favorite, created_at, updated_at
      )
      SELECT ?, owner_user_id, anonymous_session_id, project_id, prompt || ?, aspect_ratio, style, quality,
        status, width, height, r2_key, mime_type, provider, model, credit_cost, queue_tier,
        queued_at, processing_started_at, favorite, created_at, updated_at
      FROM generations WHERE id = ?`)
        .bind(`${generationId}-${suffix}`, ` ${suffix}`, generationId)
        .run();
    }

    const firstHistoryPage = await worker.fetch(
      new Request("https://qwen-image-3.net/api/generations?limit=2&offset=0", {
        headers: { Cookie: sessionCookie },
      }),
      env as never,
      executionContext as never,
    );
    const firstHistoryBody = await json<{
      generations: Array<{ id: string }>;
      page: { hasMore: boolean; nextOffset: number };
    }>(firstHistoryPage);
    assert.deepEqual(firstHistoryBody.generations.map((item) => item.id), [`${generationId}-c`, `${generationId}-b`]);
    assert.equal(firstHistoryBody.page.hasMore, true);
    assert.equal(firstHistoryBody.page.nextOffset, 2);

    const secondHistoryPage = await worker.fetch(
      new Request("https://qwen-image-3.net/api/generations?limit=2&offset=2", {
        headers: { Cookie: sessionCookie },
      }),
      env as never,
      executionContext as never,
    );
    const secondHistoryBody = await json<{
      generations: Array<{ id: string }>;
      page: { hasMore: boolean; nextOffset: number };
    }>(secondHistoryPage);
    assert.deepEqual(secondHistoryBody.generations.map((item) => item.id), [generationId]);
    assert.equal(secondHistoryBody.page.hasMore, false);
    assert.equal(secondHistoryBody.page.nextOffset, 3);

    const freeDownload = await worker.fetch(
      new Request(`https://qwen-image-3.net/api/generations/${generationId}/download`, {
        headers: { Cookie: sessionCookie },
      }),
      env as never,
      executionContext as never,
    );
    assert.equal(freeDownload.headers.get("x-export-tier"), "free");
    assert.equal(freeDownload.headers.get("x-export-watermarked"), "true");
    assert.match(await freeDownload.text(), /data-export-watermark="free"/);

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
    const starterDownload = await worker.fetch(
      new Request(`https://qwen-image-3.net/api/generations/${generationId}/download`, {
        headers: { Cookie: sessionCookie },
      }),
      env as never,
      executionContext as never,
    );
    assert.equal(starterDownload.headers.get("x-export-tier"), "starter");
    assert.equal(starterDownload.headers.get("x-export-watermarked"), "false");
    assert.equal(starterDownload.headers.get("content-type"), "image/png");
    assert.match(starterDownload.headers.get("content-disposition") ?? "", /-original\.png"/);
    assert.deepEqual(new Uint8Array(await starterDownload.arrayBuffer()), sourceBytes);

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
    const creatorDownload = await worker.fetch(
      new Request(`https://qwen-image-3.net/api/generations/${generationId}/download`, {
        headers: { Cookie: sessionCookie },
      }),
      env as never,
      executionContext as never,
    );
    assert.equal(creatorDownload.headers.get("x-export-tier"), "vip");
    assert.equal(creatorDownload.headers.get("x-export-watermarked"), "false");
  } finally {
    await miniflare.dispose();
  }
});
