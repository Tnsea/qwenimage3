# Qwen Image Generator Hub — Agent Rules

## Purpose

This repository is an English-only, independent image-generation web product. Its Cloudflare acceptance environment is available at `https://qwen-image-3.net`, but it is not production-approved. Never describe local adapters, tests, disabled providers, or the acceptance environment as externally accepted production services.

## Commands

- Install: `npm install`
- Develop: `npm run dev`
- Type-check: `npm run check`
- Test: `npm test`
- Build: `npm run build`
- Start the built Worker locally: `npm start`
- Run the legacy Express comparison adapter only when explicitly required: `npm run legacy:dev`

Run `npm run check`, `npm test`, and `npm run build` after behavior changes. For documentation-only work, verify local Markdown links and search for conflicting status claims.

## Stack and Layout

- `src/`: React 19 client, Tailwind CSS 4, daisyUI 5.
- `server/`: legacy Express/SQLite comparison implementation; not an active product runtime.
- `worker/`: canonical Cloudflare Worker API, D1 migrations, R2 asset access, OAuth, maintenance, and Stripe webhook handling.
- `tests/`: Node test-runner integration and adapter tests.
- `docs/`: architecture, operations, and release readiness.
- `PRODUCT.md`: product contract and current/target status.
- `README.md`: setup and operator entry point.

## Engineering Conventions

- Keep all customer-facing UI in reviewed English.
- Preserve private-by-default ownership checks and server-authoritative quotas.
- Never expose secrets, raw session/API tokens, or provider credentials.
- Database balance changes and billing fulfillment must remain transactional and idempotent.
- Add canonical schema changes through forward-only D1 migrations in `worker/migrations/`. Touch the legacy SQLite registry only when a task explicitly targets the comparison adapter.
- Do not add a dependency, environment variable, route, or user-visible capability without updating its authoritative documentation and tests.

## Truth and Release Boundaries

- Local development and the Pages fallback default to the deterministic SVG preview; the canonical acceptance Worker currently selects Kie.ai. Acceptance separates submission from execution with standard and priority Cloudflare Queues, persists Kie task IDs, polls owned generation state, and refunds terminal failures; consult `docs/RELEASE_READINESS.md` for exact deployment evidence.
- The implemented external adapters target Alibaba Cloud `qwen-image-2.0-pro` and Kie.ai `qwen2/text-to-image`. One signed-in Kie.ai request completed product-credit settlement, private R2 persistence, and browser rendering in acceptance, but failure/timeout handling, provider commercial approval, and production approval remain pending; Alibaba is not externally accepted, and no Qwen Image 3 integration is verified.
- The Cloudflare Worker custom domain, D1, and R2 acceptance runtime is deployed and smoke-tested; Pages is a separately deployed local-preview fallback that passed the current browser catalog contract, not provider parity. Stripe restricted-key, signed-webhook, and the configured lifecycle in an isolated Sandbox are recorded in `docs/RELEASE_READINESS.md`. One real Google sign-in passed and Google's external-user consent screen is published; this is not product production approval. Google denial/failure paths, GitHub, Resend, Docker, the remaining Kie.ai failure/timeout/commercial gates, Alibaba Qwen execution, and launch approval remain unverified.
- Billing is fail-closed behind `BILLING_ENABLED` for new Checkout creation; configured webhook settlement and external cleanup stay available. Local and signed-event tests do not replace paid Stripe test-mode acceptance.
- New guest generation is disabled. The scheduled 24-hour maintenance path remains only to drain legacy guest assets; backup deletion and production telemetry remain unverified.
- `compose.yaml` is local-only and must not be presented as an internet deployment configuration.
- A clean build is not a deployment. Distinguish implemented, locally verified, externally verified, deployed, and live verified.

## Current Priority

Keep Studio generation actions aligned across the continuous Create conversation and the History archive; Create must retain prior prompt/response turns and show an in-place processing state as soon as a request starts. Complete review and merge of the acceptance branch, and verify the remaining blockers in `docs/RELEASE_READINESS.md`. Do not delete runtime data, generated artifacts, branches, or worktrees without an explicit post-report confirmation.
