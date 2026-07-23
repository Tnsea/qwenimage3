# Operations

Last verified: July 23, 2026

This runbook covers local execution, the Cloudflare acceptance environment, and the remaining production gates. The custom-domain environment is deployed but is not an approved production launch.

## Canonical Worker Environment

| Variable | Local default | Required when | Security note |
|---|---|---|---|
| `APP_BASE_URL` | Canonical acceptance URL in checked-in config | Email links, OAuth, billing redirects | Must be the exact HTTPS origin outside Wrangler-local development |
| `DEPLOY_REVISION` | Fallback release label | Health/deployment correlation in local and legacy Pages runtimes | The canonical Worker reports its immutable Cloudflare version ID from `CF_VERSION_METADATA` |
| `EXTERNAL_HTTP_TIMEOUT_MS` | `15000` | OAuth, email, generation, and asset calls | Effective range is 1–120 seconds |
| `RESEND_API_KEY`, `EMAIL_FROM` | Empty | Resend delivery | Keep in managed secrets |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Empty | Google sign-in | Callback origin must match `APP_BASE_URL` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Empty | GitHub sign-in | Callback origin must match `APP_BASE_URL` |
| `GENERATION_PROVIDER` | `local` | Select `local` or `qwen` | `local` is a deterministic preview, not a real model |
| `DASHSCOPE_API_KEY` | Empty | Qwen provider | Server-side secret |
| `QWEN_API_BASE_URL` | Empty | Qwen provider | HTTPS URL for the intended Model Studio workspace/region |
| `QWEN_API_ALLOWED_HOST` | Empty | Qwen provider | Exact hostname of `QWEN_API_BASE_URL`; wildcards and suffix matching are not accepted |
| `QWEN_MODEL_ID` | `qwen-image-2.0-pro` | Implemented model contract | Other values are rejected until a separate adapter and release gate are reviewed |
| `QWEN_IMAGE_ALLOWED_HOSTS` | Empty | Qwen asset download | Comma-separated exact HTTPS hostnames; redirects are rejected |
| `BILLING_ENABLED` | `false` | Enable new Stripe Checkout offers | Keep false until test-mode and policy gates pass; signed webhooks and external cleanup remain active when credentials exist |
| `STRIPE_TIMEOUT_MS` | `15000` | Stripe API calls | Minimum effective value is one second |
| `STRIPE_SECRET_KEY` | Empty | Stripe API, Portal, and external cleanup | Use a restricted managed key; never commit it |
| `STRIPE_WEBHOOK_SECRET` | Empty | Billing webhook | Rotate and store as a managed secret |
| `STRIPE_PRICE_STARTER_MONTHLY` | Live Price ID configured | USD 9.90/month, 500 credits | Never reuse a Stripe Price ID for different credits or money |
| `STRIPE_PRICE_STARTER_YEARLY` | Live Price ID configured | USD 99/year, 6,000 annual credits | Yearly credits are granted as one annual allowance |
| `STRIPE_PRICE_CREATOR_MONTHLY` | Live Price ID configured | USD 29.90/month, 2,000 credits | Never reuse the retired USD 10 Creator Price |
| `STRIPE_PRICE_CREATOR_YEARLY` | Live Price ID configured | USD 299/year, 24,000 annual credits | Yearly credits are granted as one annual allowance |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` | Live Price ID configured | USD 59.90/month, 5,000 credits | Match the D1 version exactly |
| `STRIPE_PRICE_PROFESSIONAL_YEARLY` | Live Price ID configured | USD 599/year, 60,000 annual credits | Yearly credits are granted as one annual allowance |
| `STRIPE_PRICE_CREDITS_400` | Live Price ID configured | USD 12 one time, 400 credits | Match the D1 version exactly |
| `STRIPE_PRICE_CREDITS_1200` | Live Price ID configured | USD 30 one time, 1,200 credits | Match the D1 version exactly |
| `STRIPE_PRICE_CREDITS_3000` | Live Price ID configured | USD 60 one time, 3,000 credits | Match the D1 version exactly |

`RESEND_API_KEY`, OAuth client secrets, `DASHSCOPE_API_KEY`, Stripe keys, and the webhook secret belong in managed Worker secrets. Checked-in Wrangler configuration contains only non-secret variables.

The dedicated Live webhook destination is `https://qwen-image-3.net/api/billing/webhook`. It subscribes only to the Checkout, invoice, subscription, reversal, dispute, and `radar.early_fraud_warning.created` events handled by the Worker. The restricted runtime key needs read-only `Charges and Refunds` access so a Radar warning's Charge can be resolved to its PaymentIntent; it must not receive product/Price administration access after catalog setup.

The variables `PORT`, `HOST`, `DATABASE_PATH`, `CORS_ORIGINS`, `COOKIE_SECURE`, `EMAIL_PROVIDER`, and `ALLOW_DEV_AUTH_TOKENS` apply only to the inactive Express/SQLite comparison adapter in `server/` and `.env.example`.

## Local Development

```bash
npm install
npm run dev
```

- Web and same-origin API: `http://127.0.0.1:8787`
- Health: `http://127.0.0.1:8787/api/health`

`npm run dev` builds the React client, applies forward-only migrations to Wrangler-local D1, watches the web build, and runs the canonical Worker with local D1/R2 emulation. Email and OAuth remain unavailable unless their Worker secrets are supplied; the client never receives a development verification token.

## Emitted Build Smoke

```bash
npm run build
npm start
```

Smoke checks:

```bash
curl -fsS http://127.0.0.1:8787/api/health
curl -fsSI http://127.0.0.1:8787/
```

Expected local health characteristics:

- `runtime: cloudflare-worker`;
- `status: ok` when the selected generation provider is configured;
- `provider: local-preview` and `generator: local-qwen-preview` by default;
- Google/GitHub `false` without credentials;
- Stripe `configured: false` without the required credentials and one active database Price version per offer;
- `database: cloudflare-d1`, `objectStorage: cloudflare-r2`, a revision label, and maintenance freshness.

The health endpoint is a non-sensitive configuration/readiness summary, not a deep provider request or billing reconciliation probe.

HTML responses use `Cache-Control: public, max-age=0, must-revalidate, no-transform`. The `no-transform` directive prevents Cloudflare zone-level Web Analytics from injecting an unreviewed beacon into the application shell; the strict CSP remains an independent fail-closed control.

The checked-in `compose.yaml`, `Dockerfile`, and `server/` tree run only the legacy Express/SQLite comparison adapter. They are excluded from the default development, build, CI artifact, and Cloudflare deployment paths.

## Cloudflare Acceptance Environment

Current resources:

- Canonical URL: `https://qwen-image-3.net`
- Canonical redirect: `https://www.qwen-image-3.net` → `https://qwen-image-3.net`
- Worker: `qwen-image-3`
- Pages fallback: `https://qwen-image-3.pages.dev`
- D1 database: `qwen-image-3-production`
- R2 bucket: `qwen-image-3-assets`
- Billing: disabled
- Email/GitHub OAuth: disabled
- Google OAuth: enabled with Google Auth Platform publishing status `Production` for external Google accounts
- Generation provider: deterministic local preview

Release verification, migration, and deployment:

```bash
npm run verify:release
npx wrangler d1 export qwen-image-3-production --remote --output backups/qwen-image-3-YYYYMMDD-HHMMSS.sql
npm run cf:migrate:remote
npm run cf:deploy
```

`wrangler.worker.jsonc` is the public custom-domain deployment source of truth. `wrangler.jsonc` retains the Pages fallback configuration.
Capture an R2 object inventory through the authenticated Cloudflare API or dashboard before migrations that affect object references; current Wrangler has no object-list command.

Live smoke:

```bash
curl -fsS https://qwen-image-3.net/api/health
curl -fsS -c cookies.txt -b cookies.txt https://qwen-image-3.net/api/session
curl -fsS -c cookies.txt -b cookies.txt https://qwen-image-3.net/api/catalog
curl -fsSI https://www.qwen-image-3.net/pricing
```

Expected health reports `cloudflare-d1`, `cloudflare-r2`, billing disabled, Stripe credentials/webhook configured, email disabled, and the local preview provider. The catalog response must contain plan `id`/`description`/`features`, structured prompt records, model `id`/`provider`/`available`/`status`/`speed`/`cost`/`bestFor`, promotion state, and credit packs; the client rejects a mismatched contract without unmounting the application. The July 23 acceptance created a guest generation on the previous guest-enabled revision, confirmed D1 metadata and an R2 key, fetched the private asset through the ownership route, and verified the free-export watermark headers/content. That result is historical only; the current revision requires an account and needs a fresh post-deploy smoke test. Stripe Sandbox acceptance created and expired an API-only Checkout Session, deleted that temporary Customer, delivered a signed no-op subscription update through the canonical webhook, and confirmed idempotent replay. A separate application-created USD 7/100-credit Checkout then completed with Stripe's test card: the Stripe-origin `checkout.session.completed` event completed once in D1, the order and payment became paid, and one ledger row granted exactly 100 credits. New Checkout was disabled again before the payment was submitted.

Cloudflare secrets for the canonical Worker must be written with `wrangler secret put NAME --config wrangler.worker.jsonc` and must never be committed. OAuth callbacks are `/api/auth/oauth/google/callback` and `/api/auth/oauth/github/callback` under `APP_BASE_URL`. `BILLING_ENABLED=false` blocks new Checkout while allowing configured signed webhooks and Stripe-side account cleanup to finish. Enabling new purchases requires updating that switch and redeploying only after test-mode acceptance passes.

### Google sign-in

Google sign-in requires a Google Cloud project with an OAuth consent screen and an OAuth 2.0 Client ID of type **Web application**. The current Worker uses Google's OpenID Connect `userinfo` endpoint, so no Google storage, model, or paid API service is required.

Configure the Google OAuth application with:

```text
Authorized JavaScript origin:
https://qwen-image-3.net

Authorized redirect URI:
https://qwen-image-3.net/api/auth/oauth/google/callback
```

Keep the consent screen in testing mode during initial validation and add only designated test accounts. After the successful acceptance callback, switching Google Auth Platform to `Production` makes the external OAuth application available to Google accounts outside the tester list; this OAuth publishing label does not make the website a production-approved service. Store the issued credentials as encrypted Worker secrets; do not put them in `wrangler.worker.jsonc`, `.env.example`, CI logs, or shell history:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.worker.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.worker.jsonc
```

After deploying the reviewed revision, verify:

```bash
curl -fsS https://qwen-image-3.net/api/health
curl -fsS https://qwen-image-3.net/api/auth/methods
```

Both responses must report Google OAuth as configured. Complete one consent denial and one successful sign-in with a test account. Confirm the callback returns to `/studio`, the session cookie is `HttpOnly`, `Secure`, and `SameSite=Lax`, the Google access token is absent from logs and D1, and a repeated callback is rejected because OAuth state is single-use. This closes only the Google portion of `AUTH-001`; the acceptance deployment remains non-production until the other release gates are resolved.

Acceptance evidence on July 23, 2026: Worker version `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3` reported Google configured, completed the real authorization-code and PKCE callback, created one Google identity mapping and browser session, granted the social-account starter credits once, entered the private Workspace, and left no pending OAuth state. Google Auth Platform was then switched from `Testing` to `Production` for the external user type, making sign-in available beyond the tester list. Denial/failure acceptance and reviewed release provenance remain open.

Cloudflare Web Analytics injection must remain disabled for this Worker/custom domain. The CSP deliberately permits only same-origin scripts and connections; analytics must not be “fixed” by weakening CSP.

## Billing Price Versions

`billing_price_versions` is the source of truth for the Stripe Price ID, offer, charge amount, currency, and credits granted. Checkout reads only the row marked `active_for_checkout = 1`; invoice fulfillment looks up the exact Price ID carried by Stripe and deliberately accepts retired versions. Orders and payments store that Price ID for auditability.

Treat each Stripe Price ID as immutable. A price or credit change requires a new Stripe Price and an additive D1 migration that retires the current checkout row and inserts the replacement in one migration:

```sql
UPDATE billing_price_versions
SET active_for_checkout = 0, retired_at = '2030-01-01T00:00:00.000Z'
WHERE offer_id = 'creator_monthly' AND active_for_checkout = 1;

INSERT INTO billing_price_versions
  (stripe_price_id, offer_id, kind, amount_cents, currency, credits, active_for_checkout, effective_from, created_at)
VALUES
  ('price_new_from_stripe', 'creator_monthly', 'subscription', 2990, 'usd', 2000, 1,
   '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z');
```

Do not update the amount or credits on an existing row and do not delete retired rows while Stripe subscriptions or financial records may reference them. Before applying the migration, export D1, confirm the new Stripe Price in Sandbox, keep `BILLING_ENABLED=false`, migrate, deploy, verify `/api/health` reports `priceCatalogConfigured: true`, exercise Checkout and invoice replay, then explicitly decide whether to enable sales.

## Legacy Container

```bash
docker compose up --build
```

The checked-in Compose service is a retained comparison path only. It deliberately uses:

- `COOKIE_SECURE=false`;
- `EMAIL_PROVIDER=console`;
- `ALLOW_DEV_AUTH_TOKENS=true`;
- `GENERATION_PROVIDER=local`.

It must not be used as an internet deployment configuration. The current workspace has not executed it because Docker Compose and a running daemon are unavailable.

## Database Backup and Restore

The following SQLite procedure applies only to preserved legacy/runtime evidence. SQLite uses WAL mode, so prefer an online backup rather than copying only the main database file while it is writing.

Backup example:

```bash
sqlite3 data/qwenimage.db ".backup 'data/qwenimage-backup-YYYYMMDD-HHMMSS.db'"
sqlite3 data/qwenimage-backup-YYYYMMDD-HHMMSS.db "PRAGMA integrity_check;"
```

Restore procedure:

1. Stop the application cleanly and preserve the current database as rollback evidence.
2. Validate the selected backup with `PRAGMA integrity_check`.
3. Restore to a new path first and start the application against that path.
4. Exercise health, login, ownership, generation history, and credit-balance checks.
5. Promote the restored path only after validation.

Do not overwrite the active database without an explicit recovery decision and rollback copy. No production restore exercise has been completed yet.

For D1, capture a remote export before any destructive migration:

```bash
npx wrangler d1 export qwen-image-3-production --remote --output backups/qwen-image-3-YYYYMMDD.sql
```

Restore must target a separate D1 database first, run consistency and application acceptance checks, then be promoted through an explicit binding change. R2 source objects require an independent inventory/lifecycle/deletion exercise; a D1 export alone is not a complete asset backup.

## External Integration Gates

### Resend

- Use a verified sender/domain.
- Confirm verification and reset links use the canonical HTTPS origin.
- Confirm no token appears in API responses or logs.
- Exercise delivery failure and retry behavior.

### Google and GitHub

- Register exact callbacks under the canonical origin.
- Verify approved scopes and consent-screen copy.
- Exercise new user, linked existing email, denial, invalid state, and provider failure.
- Confirm tokens are absent from storage and logs.

### Alibaba Cloud Model Studio

- Confirm region-specific base URL, model availability, account quota, price, data use, and commercial terms.
- Run Golden Prompt, moderation, timeout, invalid response, oversized asset, and rollback acceptance.
- Record the exact model ID and verification date in `PRODUCT.md` and release evidence.
- Do not label Qwen Image 3 available until a real, sourced integration exists.

### Stripe

- Keep `BILLING_ENABLED=false` in any public environment until every public-billing acceptance gate is closed.
- Use the dedicated restricted Sandbox key for the application. Stripe's default Sandbox standard secret was rotated after setup and is not an application dependency.
- Test signed delivery, out-of-order events, missing local records, replay, refunds, disputes, asynchronous payment, subscription updates, cancellation, account deletion, and reconciliation.
- The Worker validates the subscription Customer, stored subscription, immutable Price version, exact amount/currency, paid state, allowed billing reason, and PaymentIntent; test-mode must prove every current offer contract against real Stripe payloads.
- Confirm external subscription state before deleting local identity data.

## Data Retention

Current behavior:

- account sessions have 30-day expiries;
- signed-out visitors receive no anonymous generation session and cannot access generation routes;
- legacy guest rows remain cleanup-only and are not migrated into new accounts;
- Worker maintenance runs every 15 minutes to delete legacy guest assets older than 24 hours, drain the R2 deletion compensation queue, remove expired sessions/tokens/OAuth/idempotency/rate buckets, repair stranded account generation reservations, and record its result;
- Starter/paid account assets, billing/audit records, and backups do not yet have approved deletion schedules.

Required before external beta:

- monitor maintenance freshness and any overdue legacy guest records until they are drained;
- prove primary and backup deletion against the approved policy;
- document account, paid, billing, audit, and backup retention separately;
- verify deletion against primary storage and backups.

## Monitoring and Incidents

Current logging is Cloudflare invocation output plus request IDs. Every `/v1/generations` attempt is recorded with status, duration, and request ID; valid keys also retain user/key association. Retention/recovery summaries are stored in `maintenance_runs`, account-deletion completion in `account_deletion_audit`, and failed object cleanup in `r2_deletion_queue`. No production metrics, traces, dashboards, reconciliation alarms, or on-call alerts are configured.

Production acceptance requires at minimum:

- request rate, latency, and error code dashboards;
- generation success, timeout, moderation, and stranded-reservation alerts;
- credit and Stripe reconciliation alarms;
- D1 capacity, R2 cleanup backlog, backup, and restore monitoring;
- provider health and cost alerts;
- deploy revision and rollback marker.

## Release Procedure

1. Review [Release Readiness](./RELEASE_READINESS.md).
2. Run `npm run check`, `npm test`, `npm run build`, and dependency/security checks.
3. Produce a committed target revision and CI evidence.
4. Back up data and prove migrations and rollback in the target environment.
5. Deploy without enabling blocked integrations.
6. Smoke the canonical URL, API, auth, ownership, and current provider.
7. Enable external providers only after their dedicated acceptance evidence passes.
8. Record deployed revision and live verification separately from local completion.
