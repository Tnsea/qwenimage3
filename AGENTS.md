# Qwen Image Generator Hub — Agent Rules

## Purpose

This repository is an English-only, independent image-generation web product. Its Cloudflare acceptance environment is available at `https://qwen-image-3.net`, but it is not production-approved. Never describe local adapters, tests, disabled providers, or the acceptance environment as externally accepted production services.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Type-check: `npm run check`
- Test: `npm test`
- Build: `npm run build`
- Start emitted build locally: `npm run start:local`
- Start production build: `npm start` (fails closed unless production configuration passes)

Run `npm run check`, `npm test`, and `npm run build` after behavior changes. For documentation-only work, verify local Markdown links and search for conflicting status claims.

## Stack and Layout

- `src/`: React 19 client, Tailwind CSS 4, daisyUI 5.
- `server/`: Express 5 API, providers, auth, billing, security, and SQLite access.
- `worker/`: Cloudflare Worker API, D1 migrations, R2 asset access, and Stripe webhook handling for the acceptance runtime.
- `tests/`: Node test-runner integration and adapter tests.
- `docs/`: architecture, operations, and release readiness.
- `PRODUCT.md`: product contract and current/target status.
- `README.md`: setup and operator entry point.

## Engineering Conventions

- Keep all customer-facing UI in reviewed English.
- Preserve private-by-default ownership checks and server-authoritative quotas.
- Never expose secrets, raw session/API tokens, or provider credentials.
- Database balance changes and billing fulfillment must remain transactional and idempotent.
- Add local SQLite changes through the versioned migration registry and Cloudflare D1 changes through `worker/migrations/`.
- Do not add a dependency, environment variable, route, or user-visible capability without updating its authoritative documentation and tests.

## Truth and Release Boundaries

- The default provider is a deterministic local SVG preview.
- The implemented external adapter targets `qwen-image-2.0-pro`; no Qwen Image 3 integration is verified.
- The Cloudflare Worker custom domain, D1, and R2 acceptance runtime is deployed and smoke-tested; Pages remains a fallback URL. Stripe restricted-key, signed-webhook, and one paid Sandbox credit-pack lifecycle are recorded in `docs/RELEASE_READINESS.md`; Google, GitHub, Resend, Docker, real Qwen execution, and the remaining Stripe subscription/reversal/Portal/deletion lifecycle remain unverified.
- Billing is fail-closed behind `BILLING_ENABLED` for new Checkout creation; configured webhook settlement and external cleanup stay available. Local and signed-event tests do not replace paid Stripe test-mode acceptance.
- Guest assets are deleted by the scheduled 24-hour maintenance pass; backup-deletion and production telemetry remain unverified.
- `compose.yaml` is local-only and must not be presented as an internet deployment configuration.
- A clean build is not a deployment. Distinguish implemented, locally verified, externally verified, deployed, and live verified.

## Current Priority

Resolve the blockers in `docs/RELEASE_READINESS.md`, establish the first committed baseline and CI, then verify external integrations. Do not delete runtime data, generated artifacts, branches, or worktrees without an explicit post-report confirmation.
