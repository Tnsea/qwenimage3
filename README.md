# Qwen Image Generator Hub

An independent, English-only image-generation web application. Its canonical business runtime is a Cloudflare Worker backed by D1 and private R2 storage, with a React interface, account and credit flows, a deterministic preview provider, and optional external adapters. The former Express/SQLite implementation remains only as a legacy comparison adapter.

> **Release status — canonical acceptance environment deployed; production and public billing blocked.** The Cloudflare environment is live at [qwen-image-3.net](https://qwen-image-3.net) for acceptance testing. Google sign-in is published for external Google accounts; billing, production email, GitHub sign-in, and the real Qwen provider remain disabled. See [Release Readiness](./docs/RELEASE_READINESS.md) before treating any acceptance result as production approval.

This project is not affiliated with or endorsed by Alibaba or the Qwen team.

## What Works Today

| Area | Current status |
|---|---|
| Public UI | English homepage, sticky navigation, responsive generator, Examples, Prompts, Models, Pricing, Guides, and API pages |
| Search discovery | Homepage content is prerendered into the initial HTML; canonical, social metadata, JSON-LD, robots.txt, and sitemap.xml are emitted with the web build |
| Generation access | Account required for generation, history, image access, and deletion; every request uses server-authoritative credits |
| Accounts | Email/password registration and login, one-time email verification, password recovery, session management, export, and fail-safe account deletion that cleans Stripe first when linked |
| Social login | Google and GitHub authorization-code adapters with browser-bound state and PKCE; Google completed one real acceptance sign-in and its OAuth publishing status is Production, while GitHub remains unverified |
| Studio | Login-directed responsive workspace with aggregate overview, creation, projects, history, favorites, credits, billing, payments, scoped API keys, API activity, private support tickets, profile, and security settings |
| Credits | One-time 20-credit account-creation grant; atomic reservation, settlement, refund, and ledger entries |
| Developer API | Hashed, scoped, revocable API keys; synchronous `POST /v1/generations`; 24-hour idempotency; durable request logs |
| Billing adapter | Explicit kill switch, Stripe Checkout/Portal, recoverable webhook states, validated Creator invoices, refund/dispute quarantine, and external cleanup before account deletion |
| Image providers | Deterministic local SVG preview by default; optional Alibaba Cloud Model Studio adapter for `qwen-image-2.0-pro` |
| Storage | D1 records and private R2 generation assets in both Wrangler development and the Cloudflare acceptance runtime |

The application does **not** currently provide a durable asynchronous generation queue, approved retention/backup lifecycle, production monitoring/alerting, verified Qwen Image 3 integration, or externally accepted public billing.

## Local Quick Start

Requirements:

- Node.js 22 or newer
- npm

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8787`. Wrangler serves the built React client and the same-origin Worker API, using its local D1 and R2 emulators.

The default configuration uses:

- the deterministic local SVG provider;
- Wrangler-managed local D1 and R2 state;
- email and social login disabled until Worker secrets are configured;
- disabled Google, GitHub, Stripe, and real Qwen integrations.

No browser-visible development verification token exists in the canonical runtime.

## Local Release Smoke

```bash
npm run build
npm start
```

Open `http://127.0.0.1:8787`. This verifies the emitted client against the Worker/D1/R2 development runtime; it is not evidence of a deployment.

## Cloudflare Acceptance Environment

The canonical acceptance URL is [qwen-image-3.net](https://qwen-image-3.net). `https://www.qwen-image-3.net` redirects permanently to the apex domain, and [qwen-image-3.pages.dev](https://qwen-image-3.pages.dev) remains the Pages fallback.

```bash
npm run cf:migrate:remote
npm run cf:deploy
```

- A Cloudflare Worker custom domain serves the React bundle and same-origin Hono API.
- D1 stores identities, sessions, projects, credits, support conversations, rate limits, immutable Stripe Price-to-credit versions, event/order/payment records, and generation metadata.
- R2 stores private generation source assets; access always passes through server ownership checks.
- Starter-account exports are watermarked and use the standard queue; Creator entitlements use the VIP queue and original exports.
- `BILLING_ENABLED=false` remains deployed until Stripe test-mode acceptance and release gates pass.

## Legacy Container for Local Comparison

The repository retains a multi-stage, non-root Express/SQLite comparison image:

```bash
docker compose up --build
```

The checked-in `compose.yaml`, `Dockerfile`, and `server/` code are explicitly legacy and local-only. They are not an active development, release, or internet deployment path. Container execution has not been verified in the current workspace because a Compose-capable Docker daemon is unavailable.

## Optional Integrations

Copy `.env.example` into your environment and follow [Operations](./docs/OPERATIONS.md) for the complete variable matrix and verification gates.

### Production email

```bash
APP_BASE_URL=https://images.example.com
EMAIL_PROVIDER=resend
EMAIL_FROM="Qwen Image Hub <account@images.example.com>"
RESEND_API_KEY=your_resend_key
ALLOW_DEV_AUTH_TOKENS=false
COOKIE_SECURE=true
```

### Google and GitHub sign-in

Register these callbacks against the same `APP_BASE_URL`:

```text
https://images.example.com/api/auth/oauth/google/callback
https://images.example.com/api/auth/oauth/github/callback
```

Then configure the corresponding `GOOGLE_*` and `GITHUB_*` variables from `.env.example`.

### Alibaba Cloud Model Studio

The implemented adapter targets `qwen-image-2.0-pro`. No Qwen Image 3 provider is implemented or verified.

```bash
GENERATION_PROVIDER=qwen
DASHSCOPE_API_KEY=your_model_studio_key
QWEN_API_BASE_URL=https://YOUR_WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com/api/v1
QWEN_API_ALLOWED_HOST=YOUR_WORKSPACE_ID.ap-southeast-1.maas.aliyuncs.com
QWEN_MODEL_ID=qwen-image-2.0-pro
QWEN_IMAGE_ALLOWED_HOSTS=EXACT_PROVIDER_ASSET_HOST
```

The Worker downloads provider output immediately and persists it in private R2. Both the API base and returned asset must use HTTPS and exact configured hosts; redirects are rejected. Assets must also use an allowed MIME type, match their image signature, and remain under 25 MB. Provider failures release the reservation.

### Stripe

Stripe is fail-closed behind `BILLING_ENABLED=false` on the canonical acceptance environment. That switch blocks new Checkout offers without disabling signed webhook settlement or external Stripe cleanup for existing records. The replacement catalog has dedicated immutable Live and Sandbox Price IDs, matching active D1 versions, restricted runtime keys, and signed 10-event webhook destinations. A separate `sandbox.qwen-image-3.net` Worker/D1/R2 environment has accepted every configured monthly/yearly offer, credit-pack fulfillment, renewal success, failed-payment recovery, Portal and terminal cancellation, refund, dispute, Radar, missing-order recovery, and account-deletion races. Checkout exposes only synchronous `card` and `link`; delayed methods are not enabled. Public billing remains blocked on the approved risk/credit policy, external alert routing, and legal/commercial acceptance in [Release Readiness](./docs/RELEASE_READINESS.md).

The configured offer contract is:

- Starter: USD 9.90/month for 500 credits or USD 99/year for 6,000 credits.
- Creator: USD 29.90/month for 2,000 credits or USD 299/year for 24,000 credits.
- Professional: USD 59.90/month for 5,000 credits or USD 599/year for 60,000 credits.
- One-time packs: USD 12/400 credits, USD 30/1,200 credits, or USD 60/3,000 credits.

Standard, High, and Ultra generations cost 4, 8, and 16 product credits. Yearly subscriptions grant the full annual allowance after the yearly invoice is paid. Each offer requires its own immutable Stripe Price ID. Signed webhook events are idempotently stored in D1, and payment data is mapped to recoverable local orders and payment records before credits or subscription entitlements are granted. Actionable Stripe Radar early fraud warnings resolve the Charge to a known local PaymentIntent, record a risk case, and pause further credit spending without automatically refunding or misclassifying the payment.

## Developer API

After registering, verifying the email address, and creating a key in **Studio → API keys**:

```bash
curl -X POST https://qwen-image-3.net/v1/generations \
  -H "Authorization: Bearer $QWEN_HUB_API_KEY" \
  -H "Idempotency-Key: launch-001" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-qwen-preview",
    "prompt": "A glass pavilion at dawn",
    "aspect_ratio": "16:9",
    "style": "editorial",
    "quality": "high"
  }'
```

The endpoint is synchronous. `model` may be omitted to select the server's only available runtime, but explicit selection is recommended and unavailable IDs are rejected. Reusing a completed idempotency key within 24 hours returns the stored generation and does not reserve credits again. A concurrent request receives `409 REQUEST_IN_PROGRESS` and `Retry-After`.

## Data and Retention Reality

- New anonymous generation sessions are disabled. Signed-out visitors can browse but must sign in before generation or private asset access.
- New accounts receive one idempotent 20-credit welcome grant. Email verification remains required for recovery trust and developer keys, not for the grant.
- Legacy anonymous rows remain in the schema only so scheduled maintenance can drain previously created guest assets safely.
- Scheduled maintenance runs every 15 minutes, records its result, drains R2 deletion compensation work, removes expired session/security/idempotency/rate-limit state, and repairs stranded generation reservations.
- Account deletion cancels a stored Stripe subscription and deletes the Stripe Customer before local cascades. If external cleanup fails, the local account is retained.
- Backup-deletion timing, free/paid retention, and production overdue telemetry remain pending policy and infrastructure decisions.

## Verification

```bash
npm run check
npm test
npm run build
npm run check:artifacts
npm run audit:production
```

The automated suite covers rendering, the browser/Worker catalog contract, the signed-out generation gate, Cloudflare password/offer contracts, yearly-default pricing, 4/8/16 charging, Starter-versus-Creator entitlements, registration/verification, workspace overview, private support conversations, recovery, sessions, export/deletion, projects, favorites, concurrent D1 credit accounting, scoped keys, API logs/idempotency, OAuth mapping, recoverable Stripe fulfillment and invoice validation, refund and Radar fraud-warning quarantine, external deletion safety, origin rejection, maintenance, persisted rate limits, configuration gates, and Qwen host/MIME safeguards. Historical promotion tests remain isolated in the inactive comparison adapter.

Passing these commands means the repository is locally consistent. The current account-required revision has been deployed to the isolated Stripe Sandbox for the billing evidence described above; the canonical public-billing switch remains off. This does not replace the remaining OAuth/email/Stripe/Qwen acceptance, formal WCAG/browser-matrix testing, or a production launch decision.

## Project Documentation

- [Product Requirements](./PRODUCT.md) — product scope, current implementation status, target requirements, decisions, and acceptance criteria.
- [Architecture](./docs/ARCHITECTURE.md) — current components, trust boundaries, persistence model, and target evolution.
- [Operations](./docs/OPERATIONS.md) — configuration, local execution, health checks, backup/restore, and integration verification.
- [Release Readiness](./docs/RELEASE_READINESS.md) — authoritative blockers and launch evidence.
- [AGENTS.md](./AGENTS.md) — concise rules for future automated contributors.

## Stack

- React 19, Tailwind CSS 4, and daisyUI 5
- Hono on Cloudflare Workers
- Cloudflare D1 and private R2 in Wrangler development and the acceptance environment
- Express 5, Node.js, and SQLite retained only as a legacy comparison adapter
- TypeScript across client, server, and tests
