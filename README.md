# Qwen Image Generator Hub

An independent, English-only image-generation web application inspired by the supplied visual references. It includes a React interface, a local Express/SQLite runtime, a Cloudflare Pages Worker backed by D1 and private R2 storage, account and credit flows, a deterministic preview provider, and optional external adapters.

> **Release status — canonical acceptance environment deployed; production and public billing blocked.** The Cloudflare environment is live at [qwen-image-3.net](https://qwen-image-3.net) for acceptance testing with billing, production email, OAuth, and the real Qwen provider disabled. See [Release Readiness](./docs/RELEASE_READINESS.md) before enabling those integrations.

This project is not affiliated with or endorsed by Alibaba or the Qwen team.

## What Works Today

| Area | Current status |
|---|---|
| Public UI | English homepage, sticky navigation, responsive generator, Examples, Prompts, Models, Pricing, Guides, and API pages |
| Search discovery | Homepage content is prerendered into the initial HTML; canonical, social metadata, JSON-LD, robots.txt, and sitemap.xml are emitted with the web build |
| Guest creation | Three server-enforced generations per UTC day, private history, deletion, free queue, and watermarked export |
| Accounts | Email/password registration and login, one-time email verification, password recovery, session management, export, and fail-safe account deletion that cleans Stripe first when linked |
| Social login | Google and GitHub authorization-code adapters with state and PKCE; buttons appear only when credentials are configured |
| Studio | Overview, creation, projects, history, favorites, credits, billing, scoped API keys, API activity, and account settings |
| Credits | One-time 20-credit verified-email grant; atomic reservation, settlement, refund, and ledger entries |
| Developer API | Hashed, scoped, revocable API keys; synchronous `POST /v1/generations`; 24-hour idempotency; durable request logs |
| Billing adapter | Explicit kill switch, Stripe Checkout/Portal, recoverable webhook states, validated Creator invoices, refund/dispute quarantine, and external cleanup before account deletion |
| Image providers | Deterministic local SVG preview by default; optional Alibaba Cloud Model Studio adapter for `qwen-image-2.0-pro` |
| Storage | Local SQLite/WAL plus deployed Cloudflare D1 records and private R2 generation assets |

The application does **not** currently provide a durable asynchronous generation queue, approved retention/backup lifecycle, production monitoring/alerting, verified Qwen Image 3 integration, or externally accepted public billing.

## Local Quick Start

Requirements:

- Node.js 22 or newer
- npm

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The API runs at `http://127.0.0.1:8787` and Vite proxies `/api` requests to it.

The default configuration uses:

- the deterministic local SVG provider;
- SQLite at `./data/qwenimage.db`;
- console email delivery with one-time development tokens;
- disabled Google, GitHub, Stripe, and real Qwen integrations.

Do not use the default development token or insecure-cookie settings on an internet-facing service.

## Production-Like Local Build

```bash
npm run build
npm run start:local
```

Open `http://127.0.0.1:8787`. This verifies emitted JavaScript and static asset serving; it is not evidence of a production deployment.

`npm start` is the production entry point and fails closed unless HTTPS, persistent storage, production email, Qwen configuration, trusted asset hosts, and any enabled billing variables pass startup validation.

`docker compose up --build` is intentionally a local-demo profile and overrides the image command with `npm run start:local`. A production deployment should use the image's default command and provide the validated production environment.

## Cloudflare Acceptance Environment

The canonical acceptance URL is [qwen-image-3.net](https://qwen-image-3.net). `https://www.qwen-image-3.net` redirects permanently to the apex domain, and [qwen-image-3.pages.dev](https://qwen-image-3.pages.dev) remains the Pages fallback.

```bash
npm run cf:migrate:remote
npm run cf:deploy
```

- A Cloudflare Worker custom domain serves the React bundle and same-origin Hono API.
- D1 stores identities, sessions, projects, credits, rate limits, immutable Stripe Price-to-credit versions, event/order/payment records, and generation metadata.
- R2 stores private generation source assets; access always passes through server ownership checks.
- Free exports are watermarked and use the free queue; Creator entitlements use the VIP queue and original exports.
- `BILLING_ENABLED=false` remains deployed until Stripe test-mode acceptance and release gates pass.

## Container for Local Evaluation

The repository includes a multi-stage non-root image and a named SQLite volume:

```bash
docker compose up --build
```

The checked-in `compose.yaml` is intentionally local-only: it enables console auth tokens, insecure HTTP cookies, and the local preview provider. Do not deploy it unchanged. Container execution has not been verified in the current workspace because a Compose-capable Docker daemon is unavailable.

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
QWEN_MODEL_ID=qwen-image-2.0-pro
QWEN_IMAGE_ALLOWED_HOSTS=aliyuncs.com
```

The selected runtime downloads provider output immediately and persists it in local SQLite or production R2. Downloads require an approved HTTPS host, an allowed MIME type, matching image signatures, and a 25 MB limit; the local adapter additionally validates public DNS and bounded redirects. Provider failures release the reservation.

### Stripe

Stripe is fail-closed behind `BILLING_ENABLED=false`. That switch blocks new Checkout offers without disabling signed webhook settlement or external Stripe cleanup for existing records. The restricted Sandbox key, configured Prices, webhook secret, USD 7 credit-pack Checkout, Stripe-origin completion event, D1 PaymentIntent mapping, and exactly-once 100-credit grant have passed end-to-end acceptance. Public billing still requires subscription/invoice, refund/dispute, Portal/cancellation/deletion, policy, reconciliation, and legal/commercial acceptance in [Release Readiness](./docs/RELEASE_READINESS.md).

The configured offer contract is:

- Creator VIP launch subscription: USD 8/month during the server-authoritative ten-minute window.
- Creator VIP standard subscription: USD 10/month after the window.
- 100-credit pack: USD 7 one time.
- 300-credit pack: USD 18 one time.

Each offer has its own Stripe Price ID. Signed webhook events are idempotently stored in D1/SQLite, and payment data is mapped to local orders and payment records before credits or subscription entitlements are granted.

## Developer API

After registering, verifying the email address, and creating a key in **Studio → API keys**:

```bash
curl -X POST http://127.0.0.1:8787/v1/generations \
  -H "Authorization: Bearer $QWEN_HUB_API_KEY" \
  -H "Idempotency-Key: launch-001" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A glass pavilion at dawn",
    "aspect_ratio": "16:9",
    "style": "editorial",
    "quality": "high"
  }'
```

The endpoint is synchronous. Reusing the same idempotency key within 24 hours returns the stored generation and does not reserve credits again.

## Data and Retention Reality

- Guest generation ownership is bound to an HttpOnly anonymous-session cookie.
- Registration or login migrates guest generations created during the previous 24 hours.
- Guest sessions expire after 30 days, while a scheduled maintenance pass deletes guest generation assets after 24 hours.
- Maintenance runs at startup and every 15 minutes, records its result, removes expired session/security/idempotency/rate-limit state, and repairs stranded generation reservations.
- Account deletion cancels a stored Stripe subscription and deletes the Stripe Customer before local cascades. If external cleanup fails, the local account is retained.
- Backup-deletion timing, free/paid retention, and production overdue telemetry remain pending policy and infrastructure decisions.

## Verification

```bash
npm run check
npm test
npm run build
npm audit --audit-level=moderate
```

The 39-test suite covers local rendering, the shared browser/local/Worker catalog contract, Cloudflare password/offer contracts, pricing promotion persistence, quota, registration/verification, migration, recovery, sessions, export/deletion, projects, favorites, credit accounting, scoped keys, API logs/idempotency, OAuth mapping, recoverable Stripe fulfillment and invoice validation, refund quarantine, external deletion safety, origin rejection, maintenance, persisted rate limits, production config gates, and Qwen SSRF/MIME safeguards.

Passing these commands means the repository is locally consistent. The custom-domain Worker/D1/R2 health, guest session, promotion, generation, R2-backed asset, free-watermark, TLS, canonical metadata, and `www` redirect paths were live-smoke-tested. This does not replace real OAuth/email/Stripe/Qwen acceptance, formal WCAG/browser-matrix testing, or a production launch decision.

## Project Documentation

- [Product Requirements](./PRODUCT.md) — product scope, current implementation status, target requirements, decisions, and acceptance criteria.
- [Architecture](./docs/ARCHITECTURE.md) — current components, trust boundaries, persistence model, and target evolution.
- [Operations](./docs/OPERATIONS.md) — configuration, local execution, health checks, backup/restore, and integration verification.
- [Release Readiness](./docs/RELEASE_READINESS.md) — authoritative blockers and launch evidence.
- [AGENTS.md](./AGENTS.md) — concise rules for future automated contributors.

## Stack

- React 19, Tailwind CSS 4, and daisyUI 5
- Express 5 and Node.js
- Hono on Cloudflare Pages Functions/Workers
- SQLite through `node:sqlite` locally; Cloudflare D1 and R2 in the acceptance environment
- TypeScript across client, server, and tests
