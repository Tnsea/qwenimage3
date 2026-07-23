import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test, { after } from "node:test";

const testDirectory = mkdtempSync(join(tmpdir(), "qwen-product-flow-"));
process.env.DATABASE_PATH = join(testDirectory, "flow.db");
process.env.COOKIE_SECURE = "false";
process.env.EMAIL_PROVIDER = "console";
process.env.ALLOW_DEV_AUTH_TOKENS = "true";
process.env.FREE_QUEUE_DELAY_MS = "0";

const { createApp } = await import("../server/app.js");
const databaseModule = await import("../server/db.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

function cookieFrom(response: Response, name: string) {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  assert.ok(match, `Expected ${name} cookie`);
  return `${name}=${match[1]}`;
}

async function jsonRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

test("guest quota allows three generations and rejects the fourth", async () => {
  const initial = await jsonRequest("/api/session");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.entitlements.guestRemaining, 3);
  assert.match(initial.body.entitlements.guestResetsAt, /^\d{4}-\d{2}-\d{2}T/);
  const guestCookie = cookieFrom(initial.response, "qwen_guest");

  for (let index = 0; index < 3; index += 1) {
    const generated = await jsonRequest("/api/generations", {
      method: "POST",
      headers: { Cookie: guestCookie },
      body: JSON.stringify({
        prompt: `Private guest test image ${index}`,
        aspectRatio: "1:1",
        style: "Photorealistic",
        quality: "High",
      }),
    });
    assert.equal(generated.response.status, 201);
    assert.equal(generated.body.creditCost, 0);
    assert.equal(generated.body.queueTier, "free");
    assert.match(generated.body.downloadUrl, new RegExp(`/api/generations/${generated.body.id}/download$`));
    if (index === 0) {
      const freeDownload = await fetch(`${baseUrl}${generated.body.downloadUrl}`, { headers: { Cookie: guestCookie } });
      assert.equal(freeDownload.status, 200);
      assert.equal(freeDownload.headers.get("x-export-tier"), "free");
      assert.equal(freeDownload.headers.get("x-export-watermarked"), "true");
      assert.match(freeDownload.headers.get("content-disposition") ?? "", /^attachment;/);
      assert.match(await freeDownload.text(), /data-export-watermark="free"/);
    }
  }

  const rejected = await jsonRequest("/api/generations", {
    method: "POST",
    headers: { Cookie: guestCookie },
    body: JSON.stringify({ prompt: "Fourth guest image", aspectRatio: "1:1", style: "Editorial", quality: "Standard" }),
  });
  assert.equal(rejected.response.status, 429);
  assert.equal(rejected.body.error.code, "ANONYMOUS_LIMIT_REACHED");
});

test("registration migrates guest work and completes project, credit, login, and API-key flows", async () => {
  const guestSession = await jsonRequest("/api/session");
  const guestCookie = cookieFrom(guestSession.response, "qwen_guest");
  const guestGeneration = await jsonRequest("/api/generations", {
    method: "POST",
    headers: { Cookie: guestCookie },
    body: JSON.stringify({ prompt: "A guest image ready to migrate", aspectRatio: "16:9", style: "Cinematic", quality: "High" }),
  });
  assert.equal(guestGeneration.response.status, 201);

  const registration = await jsonRequest("/api/auth/register", {
    method: "POST",
    headers: { Cookie: guestCookie },
    body: JSON.stringify({ name: "End to End", email: "end-to-end@example.com", password: "Launch1234" }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.migratedGenerations, 1);
  assert.equal(registration.body.user.emailVerified, false);
  assert.equal(registration.body.entitlements.credits, 0);
  assert.equal(typeof registration.body.verification.devToken, "string");
  const sessionCookie = cookieFrom(registration.response, "qwen_session");

  const blockedKey = await jsonRequest("/api/api-keys", {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: JSON.stringify({ name: "Premature credential" }),
  });
  assert.equal(blockedKey.response.status, 403);
  assert.equal(blockedKey.body.error.code, "EMAIL_NOT_VERIFIED");

  const verification = await jsonRequest("/api/auth/verify-email", {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: JSON.stringify({ token: registration.body.verification.devToken }),
  });
  assert.equal(verification.response.status, 200);
  assert.equal(verification.body.user.emailVerified, true);
  assert.equal(verification.body.session.entitlements.credits, 20);

  const history = await jsonRequest("/api/generations?limit=10", { headers: { Cookie: sessionCookie } });
  assert.equal(history.body.generations.length, 1);
  assert.equal(history.body.generations[0].id, guestGeneration.body.id);

  const project = await jsonRequest("/api/projects", {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: JSON.stringify({ name: "Launch campaign", description: "Production flow" }),
  });
  assert.equal(project.response.status, 201);

  const accountGeneration = await jsonRequest("/api/generations", {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: JSON.stringify({
      prompt: "A cobalt sculpture for the launch campaign",
      aspectRatio: "4:3",
      style: "Editorial",
      quality: "Ultra",
      projectId: project.body.id,
    }),
  });
  assert.equal(accountGeneration.response.status, 201);
  assert.equal(accountGeneration.body.creditCost, 4);
  assert.equal(accountGeneration.body.projectId, project.body.id);
  assert.equal(accountGeneration.body.queueTier, "free");

  const freeAccountDownload = await fetch(`${baseUrl}${accountGeneration.body.downloadUrl}`, { headers: { Cookie: sessionCookie } });
  assert.equal(freeAccountDownload.headers.get("x-export-watermarked"), "true");
  assert.match(await freeAccountDownload.text(), /data-export-watermark="free"/);

  databaseModule.setStripeCustomer(registration.body.user.id, "cus_product_flow");
  assert.equal(databaseModule.updateSubscriptionStatus({
    customerId: "cus_product_flow",
    subscriptionId: "sub_product_flow",
    status: "active",
    periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
  }), true);
  const vipSession = await jsonRequest("/api/session", { headers: { Cookie: sessionCookie } });
  assert.equal(vipSession.body.entitlements.accountType, "creator");
  assert.equal(vipSession.body.entitlements.priorityGeneration, true);
  assert.equal(vipSession.body.entitlements.watermarkedExports, false);
  const vipDownload = await fetch(`${baseUrl}${accountGeneration.body.downloadUrl}`, { headers: { Cookie: sessionCookie } });
  assert.equal(vipDownload.headers.get("x-export-tier"), "vip");
  assert.equal(vipDownload.headers.get("x-export-watermarked"), "false");
  assert.doesNotMatch(await vipDownload.text(), /data-export-watermark="free"/);

  const favorite = await jsonRequest(`/api/generations/${accountGeneration.body.id}/favorite`, {
    method: "PATCH",
    headers: { Cookie: sessionCookie },
    body: JSON.stringify({ favorite: true }),
  });
  assert.equal(favorite.body.favorite, true);

  const creditsAfterWeb = await jsonRequest("/api/credits", { headers: { Cookie: sessionCookie } });
  assert.deepEqual(creditsAfterWeb.body.account, { available: 16, reserved: 0 });
  const webLedgerTypes = new Set(creditsAfterWeb.body.ledger.map((entry: { type: string }) => entry.type));
  assert.equal(webLedgerTypes.has("generation_reservation"), true);
  assert.equal(webLedgerTypes.has("generation_settlement"), true);
  assert.equal(webLedgerTypes.has("signup_grant"), true);

  const key = await jsonRequest("/api/api-keys", {
    method: "POST",
    headers: { Cookie: sessionCookie },
    body: JSON.stringify({ name: "Automated integration" }),
  });
  assert.equal(key.response.status, 201);
  assert.match(key.body.secret, /^qig_/);
  assert.deepEqual(key.body.scopes, ["generations:write"]);

  const apiRequest = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key.body.secret}`,
      "Idempotency-Key": "product-flow-001",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: "A glass pavilion at dawn", aspect_ratio: "3:2", style: "editorial", quality: "standard" }),
  } satisfies RequestInit;
  const firstApiGeneration = await jsonRequest("/v1/generations", apiRequest);
  const repeatedApiGeneration = await jsonRequest("/v1/generations", apiRequest);
  assert.equal(firstApiGeneration.response.status, 201);
  assert.equal(repeatedApiGeneration.response.status, 200);
  assert.equal(repeatedApiGeneration.body.id, firstApiGeneration.body.id);

  const creditsAfterApi = await jsonRequest("/api/credits", { headers: { Cookie: sessionCookie } });
  assert.equal(creditsAfterApi.body.account.available, 15);
  assert.equal(creditsAfterApi.body.account.reserved, 0);
  const apiLogs = await jsonRequest("/api/api-logs", { headers: { Cookie: sessionCookie } });
  assert.equal(apiLogs.response.status, 200);
  assert.equal(apiLogs.body.requests.length, 2);
  assert.equal(apiLogs.body.requests[0].path, "/v1/generations");
  assert.equal(typeof apiLogs.body.requests[0].requestId, "string");

  const logout = await jsonRequest("/api/auth/logout", { method: "POST", headers: { Cookie: sessionCookie } });
  assert.equal(logout.response.status, 204);
  const loggedOutStudio = await jsonRequest("/api/projects", { headers: { Cookie: sessionCookie } });
  assert.equal(loggedOutStudio.response.status, 401);

  const login = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "end-to-end@example.com", password: "Launch1234" }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.name, "End to End");
  assert.equal(login.body.entitlements.credits, 15);
});

test("unknown API routes return a structured 404 instead of the application shell", async () => {
  const missing = await jsonRequest("/api/not-a-real-route");
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error.code, "NOT_FOUND");
});

test("unsafe cross-origin writes are rejected with a structured 403", async () => {
  const rejected = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
    body: JSON.stringify({ email: "nobody@example.com", password: "Guess1234" }),
  });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.error.code, "ORIGIN_REJECTED");
  assert.equal(rejected.response.headers.get("access-control-allow-origin"), null);
});

test("account security supports profile changes, device revocation, password recovery, export, and deletion", async () => {
  const registration = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Security Owner", email: "security@example.com", password: "Secure1234" }),
  });
  assert.equal(registration.response.status, 201);
  const firstCookie = cookieFrom(registration.response, "qwen_session");

  const verified = await jsonRequest("/api/auth/verify-email", {
    method: "POST",
    headers: { Cookie: firstCookie },
    body: JSON.stringify({ token: registration.body.verification.devToken }),
  });
  assert.equal(verified.body.user.emailVerified, true);

  const secondLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { "User-Agent": "Second browser" },
    body: JSON.stringify({ email: "security@example.com", password: "Secure1234" }),
  });
  const secondCookie = cookieFrom(secondLogin.response, "qwen_session");

  const sessions = await jsonRequest("/api/account/sessions", { headers: { Cookie: firstCookie } });
  assert.equal(sessions.body.sessions.length, 2);
  assert.equal(sessions.body.sessions.some((item: { current: boolean }) => item.current), true);

  const revokeOthers = await jsonRequest("/api/account/sessions/revoke-others", { method: "POST", headers: { Cookie: firstCookie } });
  assert.equal(revokeOthers.body.revoked, 1);
  const revokedSession = await jsonRequest("/api/projects", { headers: { Cookie: secondCookie } });
  assert.equal(revokedSession.response.status, 401);

  const profile = await jsonRequest("/api/account/profile", {
    method: "PATCH",
    headers: { Cookie: firstCookie },
    body: JSON.stringify({ name: "Security Lead" }),
  });
  assert.equal(profile.body.user.name, "Security Lead");

  const passwordChange = await jsonRequest("/api/account/password", {
    method: "POST",
    headers: { Cookie: firstCookie },
    body: JSON.stringify({ currentPassword: "Secure1234", newPassword: "Changed5678" }),
  });
  assert.equal(passwordChange.response.status, 200);

  const oldPasswordLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "security@example.com", password: "Secure1234" }),
  });
  assert.equal(oldPasswordLogin.response.status, 401);

  const resetRequest = await jsonRequest("/api/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email: "security@example.com" }),
  });
  assert.equal(resetRequest.response.status, 202);
  assert.equal(typeof resetRequest.body.devToken, "string");

  const reset = await jsonRequest("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token: resetRequest.body.devToken, password: "Recovered9012" }),
  });
  assert.equal(reset.response.status, 200);
  const revokedByReset = await jsonRequest("/api/projects", { headers: { Cookie: firstCookie } });
  assert.equal(revokedByReset.response.status, 401);

  const recoveredLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "security@example.com", password: "Recovered9012" }),
  });
  assert.equal(recoveredLogin.response.status, 200);
  const recoveredCookie = cookieFrom(recoveredLogin.response, "qwen_session");

  const accountExport = await jsonRequest("/api/account/export", { headers: { Cookie: recoveredCookie } });
  assert.equal(accountExport.response.status, 200);
  assert.match(accountExport.response.headers.get("content-disposition") ?? "", /attachment/);
  assert.equal(accountExport.body.user.name, "Security Lead");
  assert.equal("password_hash" in accountExport.body.user, false);

  const rejectedDeletion = await jsonRequest("/api/account", {
    method: "DELETE",
    headers: { Cookie: recoveredCookie },
    body: JSON.stringify({ password: "Recovered9012", confirmation: "NO" }),
  });
  assert.equal(rejectedDeletion.response.status, 400);

  const deletion = await jsonRequest("/api/account", {
    method: "DELETE",
    headers: { Cookie: recoveredCookie },
    body: JSON.stringify({ password: "Recovered9012", confirmation: "DELETE" }),
  });
  assert.equal(deletion.response.status, 204);
  const deletedLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "security@example.com", password: "Recovered9012" }),
  });
  assert.equal(deletedLogin.response.status, 401);
});
