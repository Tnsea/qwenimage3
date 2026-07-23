# Operations

Last verified: July 23, 2026

This runbook covers local execution, the Cloudflare acceptance environment, and the remaining production gates. The custom-domain environment is deployed but is not an approved production launch.

## Environment Matrix

| Variable | Local default | Required when | Security note |
|---|---|---|---|
| `PORT` | `8787` | Changing API port | Numeric listener port |
| `HOST` | `127.0.0.1` | Container or network bind | Use `0.0.0.0` only behind intended network controls |
| `DATABASE_PATH` | `./data/qwenimage.db` | Custom storage path | Back up the database and WAL consistently |
| `APP_BASE_URL` | Local URL | Email links, OAuth, billing redirects | Must be the canonical HTTPS origin outside local development |
| `CORS_ORIGINS` | `APP_BASE_URL` | Additional exact browser origins | Comma-separated exact origins; localhost is added only outside production |
| `COOKIE_SECURE` | `false` | HTTPS deployment | Must be `true` on the public service |
| `EXTERNAL_HTTP_TIMEOUT_MS` | `15000` | OAuth and email calls | Minimum effective value is one second |
| `EMAIL_PROVIDER` | `console` | Select `console` or `resend` | Console is local-only |
| `ALLOW_DEV_AUTH_TOKENS` | `true` | Local verification/recovery | Must be `false` on any public service |
| `RESEND_API_KEY`, `EMAIL_FROM` | Empty | Resend delivery | Keep in managed secrets |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Empty | Google sign-in | Callback origin must match `APP_BASE_URL` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Empty | GitHub sign-in | Callback origin must match `APP_BASE_URL` |
| `GENERATION_PROVIDER` | `local` | Select `local` or `qwen` | `local` is a deterministic preview, not a real model |
| `DASHSCOPE_API_KEY` | Empty | Qwen provider | Server-side secret |
| `QWEN_API_BASE_URL` | Empty | Qwen provider | Must identify the intended Model Studio workspace/region |
| `QWEN_MODEL_ID` | `qwen-image-2.0-pro` | Model override | Require release-gate evidence before changing |
| `QWEN_IMAGE_ALLOWED_HOSTS` | `aliyuncs.com` | Qwen asset download | Explicit suffix allowlist; DNS must also resolve publicly |
| `BILLING_ENABLED` | `false` | Enable new Stripe Checkout offers | Keep false until test-mode and policy gates pass; signed webhooks and external cleanup remain active when credentials exist |
| `STRIPE_TIMEOUT_MS` | `15000` | Stripe API calls | Minimum effective value is one second |
| `STRIPE_SECRET_KEY` | Empty | Stripe API, Portal, and external cleanup | Use a restricted managed key; never commit it |
| `STRIPE_WEBHOOK_SECRET` | Empty | Billing webhook | Rotate and store as a managed secret |
| `STRIPE_PRICE_CREATOR_INTRO` | Empty | Seed the first launch-price version | The database catalog becomes the financial source of truth |
| `STRIPE_PRICE_CREATOR_MONTHLY` | Empty | Seed the first standard Creator version | Never reuse a Stripe Price ID for different credits or money |
| `STRIPE_PRICE_CREDITS_100` | Empty | Seed the first 100-credit version | Verify USD 7 one-time amount before seeding |
| `STRIPE_PRICE_CREDITS_300` | Empty | Seed the first 300-credit version | Verify USD 18 one-time amount before seeding |

`NODE_ENV` is set by npm scripts and is not copied into `.env.example` as a user secret.

## Local Development

```bash
npm install
npm run dev
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`
- Health: `http://127.0.0.1:8787/api/health`

Console email logs one-time links and returns development tokens to the local UI. Treat terminal output as sensitive while those tokens are valid.

## Emitted Build Smoke

```bash
npm run build
npm run start:local
```

Smoke checks:

```bash
curl -fsS http://127.0.0.1:8787/api/health
curl -fsSI http://127.0.0.1:8787/
```

Expected local health characteristics:

- `status: ok` when the selected generation and email providers report configured;
- `provider: local-preview` and `generator: local-qwen-preview` by default;
- Google/GitHub `false` without credentials;
- Stripe `configured: false` without the required credentials and one active database Price version per offer;
- database reported as SQLite.

The health endpoint is a configuration/readiness summary, not a deep provider request, database write probe, billing reconciliation check, or deployment marker.

`npm start` sets `NODE_ENV=production` and refuses to listen unless the canonical URL is HTTPS, cookies are secure, development tokens are disabled, storage is persistent, Resend and Qwen are configured, asset hosts are explicit, and every variable for any enabled billing surface is present.

The checked-in `compose.yaml` is a local-demo profile: it explicitly runs `npm run start:local` with console email and the deterministic local generator. Production orchestration must retain the image's default production command and supply the validated environment instead of copying that local profile.

## Cloudflare Acceptance Environment

Current resources:

- Canonical URL: `https://qwen-image-3.net`
- Canonical redirect: `https://www.qwen-image-3.net` → `https://qwen-image-3.net`
- Worker: `qwen-image-3`
- Pages fallback: `https://qwen-image-3.pages.dev`
- D1 database: `qwen-image-3-production`
- R2 bucket: `qwen-image-3-assets`
- Billing: disabled
- Email/OAuth: disabled
- Generation provider: deterministic local preview

Deploy and migrate:

```bash
npm run cf:migrate:remote
npm run cf:deploy
```

`wrangler.worker.jsonc` is the public custom-domain deployment source of truth. `wrangler.jsonc` retains the Pages fallback configuration.

Live smoke:

```bash
curl -fsS https://qwen-image-3.net/api/health
curl -fsS -c cookies.txt -b cookies.txt https://qwen-image-3.net/api/session
curl -fsS -c cookies.txt -b cookies.txt https://qwen-image-3.net/api/catalog
curl -fsSI https://www.qwen-image-3.net/pricing
```

Expected health reports `cloudflare-d1`, `cloudflare-r2`, billing disabled, Stripe credentials/webhook configured, email disabled, and the local preview provider. The catalog response must contain plan `id`/`description`/`features`, structured prompt records, model `id`/`status`/`speed`/`cost`/`bestFor`, promotion state, and credit packs; the client rejects a mismatched contract without unmounting the application. The July 23 acceptance also created a guest generation, confirmed D1 metadata and an R2 key, fetched the private asset through the ownership route, and verified the free-export watermark headers/content. Stripe Sandbox acceptance created and expired an API-only Checkout Session, deleted that temporary Customer, delivered a signed no-op subscription update through the canonical webhook, and confirmed idempotent replay. A separate application-created USD 7/100-credit Checkout then completed with Stripe's test card: the Stripe-origin `checkout.session.completed` event completed once in D1, the order and payment became paid, and one ledger row granted exactly 100 credits. New Checkout was disabled again before the payment was submitted.

Cloudflare secrets for the canonical Worker must be written with `wrangler secret put NAME --config wrangler.worker.jsonc` and must never be committed. `BILLING_ENABLED=false` blocks new Checkout while allowing configured signed webhooks and Stripe-side account cleanup to finish. Enabling new purchases requires updating that switch in the Worker configuration and redeploying only after test-mode acceptance passes.

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
  ('price_new_from_stripe', 'creator_monthly', 'subscription', 1200, 'usd', 450, 1,
   '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z');
```

Do not update the amount or credits on an existing row and do not delete retired rows while Stripe subscriptions or financial records may reference them. Before applying the migration, export D1, confirm the new Stripe Price in Sandbox, keep `BILLING_ENABLED=false`, migrate, deploy, verify `/api/health` reports `priceCatalogConfigured: true`, exercise Checkout and invoice replay, then explicitly decide whether to enable sales.

## Container

```bash
docker compose up --build
```

The checked-in Compose service is for local evaluation only. It deliberately uses:

- `COOKIE_SECURE=false`;
- `EMAIL_PROVIDER=console`;
- `ALLOW_DEV_AUTH_TOKENS=true`;
- `GENERATION_PROVIDER=local`.

A deployment platform must override those values, use managed secrets, mount durable storage, provide health supervision, and prove backup/restore. The current workspace has not executed the container because Docker Compose and a running daemon are unavailable.

## Database Backup and Restore

SQLite uses WAL mode. Prefer an online SQLite backup rather than copying only the main database file while the service is writing.

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
- Local and Worker code validate the Creator Customer, stored subscription, configured launch or standard Price, paid state, exact USD 800 or 1000 amount, allowed billing reason, and PaymentIntent; test-mode must prove that contract against real Stripe payloads.
- Confirm external subscription state before deleting local identity data.

## Data Retention

Current behavior:

- account and guest sessions have 30-day expiries;
- guest-to-account migration considers the previous 24 hours;
- guest history and asset access are denied after 24 hours;
- maintenance runs at startup and every 15 minutes to delete guest asset rows older than 24 hours, remove expired sessions/tokens/OAuth/idempotency/rate buckets, repair stranded generation reservations, and record its result;
- free/paid account assets, billing/audit records, and backups do not yet have approved deletion schedules.

Required before external beta:

- monitor maintenance freshness and overdue guest records in the target environment;
- prove primary and backup deletion against the approved policy;
- document account, paid, billing, audit, and backup retention separately;
- verify deletion against primary storage and backups.

## Monitoring and Incidents

Current logging is process console output plus request IDs. Authenticated developer generation calls are stored in `api_request_logs`, and retention/recovery summaries are stored in `maintenance_runs`. No production log pipeline, metrics, traces, dashboards, or alerts are configured.

Production acceptance requires at minimum:

- request rate, latency, and error code dashboards;
- generation success, timeout, moderation, and stranded-reservation alerts;
- credit and Stripe reconciliation alarms;
- database capacity, WAL, backup, and restore monitoring;
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
