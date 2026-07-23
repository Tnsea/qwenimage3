# Release Readiness

Snapshot: July 23, 2026

Overall state: **BLOCKED FOR EXTERNAL BETA AND PUBLIC BILLING**

The application is locally functional and verified. This file is the authoritative list of remaining launch gates; README and product copy must not convert a pending item into a current guarantee.

## Evidence Already Available

| Evidence | Result |
|---|---|
| TypeScript client/server checks | Pass |
| Automated tests | 68 passed, 0 failed, including account-required generation, exactly-once welcome credits, 4/8/16 credit charging, Starter-versus-Creator entitlements, yearly-default pricing, unsupported-model rejection, stable non-JSON edge errors, concurrent D1 credits/idempotency, Worker Stripe replay and Radar fraud-warning quarantine, maintenance repeatability, origin isolation, HTML transformation prevention, and external-policy contracts |
| Production bundle | Pass; JavaScript gzip about 94.5 KB; artifact scan rejects loopback addresses, SQLite customer copy, and development-token copy |
| npm dependency audit | Production dependency audit passes with zero findings; full development-tool audit remains blocked by three high-severity Wrangler/Miniflare/Sharp findings |
| Static UI quality | Strict unused checks, React Hooks rules, and baseline JSX accessibility rules pass |
| Local health endpoint | HTTP 200 from the Wrangler Worker with local D1/R2 emulation, deterministic preview provider, and email disabled unless explicitly configured |
| Security response headers | CSP, referrer policy, MIME protection, frame denial, permissions policy, COOP present |
| Billing lifecycle regression | Retryable events, strict invoice validation, refund/dispute quarantine, and external-first deletion pass locally |
| Retention/recovery regression | Legacy 24-hour guest deletion, stranded account-reservation recovery, maintenance recording, and R2 deletion compensation are implemented; the first post-deploy scheduled acceptance pass completed successfully at `2026-07-23T09:30:08Z` and health reported it fresh |
| Provider download security | Approved-host, public-DNS, redirect, MIME/signature, and size enforcement pass adapter tests |
| Browser smoke | Desktop, 390 px mobile navigation, authentication dialog, unauthenticated Studio gate, generation failure handling, and 404 were visually verified on the previous acceptance revision; the new account-required generator gate needs a fresh browser pass |
| Google OAuth acceptance | Worker version `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3` completed a real Google authorization-code and PKCE callback, created one identity mapping and browser session, granted starter credits once, entered the private Workspace, consumed the OAuth state, and was subsequently published for external Google accounts |
| Secret-pattern check | No real credential detected in the working-tree scan; placeholders only |
| Cloudflare acceptance environment | Worker custom domains `qwen-image-3.net` and `www.qwen-image-3.net`, D1 database, private R2 bucket, and the 15-minute maintenance trigger are deployed. Forward migrations `0001`–`0009` are applied. Worker version `04d02c4e-4843-4e6c-b2a4-6607079c872e` passed live health/session/catalog/redirect checks and a signed-webhook replay check; the pricing browser smoke confirmed the signed-in 20-credit account, monthly toggle, yearly default, and disabled Checkout gate. |
| Stripe integration | Historical Sandbox evidence: the retired USD 7/100-credit catalog completed one application-created Checkout and exactly-once webhook grant. The replacement Starter/Creator/Professional monthly/yearly and 400/1,200/3,000-credit pack Prices now exist in Live mode, active D1 versions match all nine Prices, and a dedicated restricted key plus 10-event Live webhook destination are deployed. A signed acceptance event completed once and returned `duplicate` on replay. The replacement catalog is not yet accepted through Checkout/payment/Portal/reversal end to end; billing remains disabled |

Source-control evidence:

- baseline commit `39b9e3a` is pushed to `Tnsea/qwenimage3`;
- hardening commit `61cf65e` is pushed on `codex/worker-online-hardening`;
- GitHub Actions run `29995895346` passed the full CI workflow for pull request 1.

Limitations of this evidence:

- real Resend, GitHub, and Qwen credentials were not exercised; Google completed one successful acceptance sign-in but its denial/failure paths remain open; Stripe Sandbox credit-pack Checkout and Stripe-origin webhook fulfillment passed once, but no subscription, recurring invoice, asynchronous payment, refund, dispute, Portal, cancellation, or account-deletion lifecycle has passed end to end;
- Docker/Compose execution was unavailable;
- the deployed Worker is an acceptance revision, not a production approval or a reviewed release marker;
- no formal accessibility, browser-matrix, load, recovery, or external security review exists.
- Stripe's default Sandbox standard secret was rotated by the account owner after setup. The Worker continues to use the separate restricted key.

## P0 — Public Billing Blockers

### BIL-001: External-first account deletion — locally closed, Stripe acceptance pending

**Evidence:** `DELETE /api/account` cancels a stored Stripe subscription, deletes the Stripe Customer, and only then removes local data. A mocked integration test proves that customer-deletion failure returns 502 and preserves the local user.

**Remaining:** approve cancel/delete versus retention policy and pass real Stripe test-mode cases for active, trialing, past-due, already canceled, cancel-at-period-end, and webhook races.

### BIL-002: Recoverable webhook fulfillment — locally closed, Stripe acceptance pending

**Evidence:** events use `processing`, `failed`, and `completed` states with attempt counts and stale-lock recovery. Missing local records return a retryable status; a regression test delivers the event before the order and succeeds on replay after the order appears. With new Checkout disabled, Stripe delivered the real Sandbox `checkout.session.completed` event for the paid credit-pack session; D1 completed it in one attempt, created one PaymentIntent mapping and one purchase ledger row, and granted exactly 100 credits. A separate signed acceptance event also returned the duplicate response on replay. Webhook settlement and Stripe cleanup remain available while new sales are paused.

**Remaining:** exercise real out-of-order Checkout, invoice, subscription, asynchronous payment, and replay sequences and add operator alerts for failed/stale events.

### BIL-003: Creator invoice validation — locally closed, Stripe acceptance pending

**Evidence:** a Creator grant requires the known Customer/subscription, a known immutable Price-version row, paid status, matching USD amount, allowed billing reason, invoice ID, and PaymentIntent. Checkout uses only the active version, while old subscriptions continue to grant the historical credits carried by their retired Price ID. Orders and payments retain the Price ID; invalid Price/amount/currency receives 422 and grants nothing. Regression coverage switches the active standard plan from USD 10/300 credits to USD 12/450 credits and proves both old and new invoice contracts remain idempotent.

**Remaining:** confirm real Stripe API-version payload shapes and approve how discounts, taxes, credits, and prorations map to the versioned entitlement contract.

### BIL-004: Refund/dispute/fraud-warning lifecycle — partially implemented, policy and reconciliation blocked

**Evidence:** PaymentIntents map to product payments; refund/dispute events update payment and order financial status and pause further credit spending with a visible Billing warning. Actionable Radar early fraud warnings resolve Charge-to-PaymentIntent using least-privilege read access, store separate risk evidence, and pause spending without changing the paid/refunded/disputed status. Fulfillment is idempotent.

**Remaining:** approve clawback/negative-balance/support and proactive-refund policy, implement reviewed risk-resolution/unblock operations, handle every asynchronous failure variant, build reconciliation and alerts, and pass Stripe test-mode end to end.

Public billing stays fail-closed behind `BILLING_ENABLED=false` until every remaining item above passes. This switch blocks new Checkout offers; configured webhook verification and Stripe-side cleanup continue so already-created financial state can drain safely.

## P1 — External Beta Blockers

### DATA-001: Legacy guest cleanup — local and scheduled Cloudflare implementation, lifecycle evidence pending

**Evidence:** new anonymous generation is disabled in the current code. Local startup/15-minute maintenance and the deployed Worker cron retain the old 24-hour deletion path so previously created guest rows/assets can drain safely; automated recovery/retention tests pass. The first post-deploy cron pass completed at `2026-07-23T09:30:08Z`, and the live health response reported `completed` and fresh.

**Remaining:** observe an actual expired-object deletion in Cloudflare, approve policy, instrument overdue D1/R2 storage, and prove backup deletion.

### BRAND-001: Unsupported Qwen Image 3 release claim — closed locally

**Evidence:** the release date/link and every Qwen Image 3 availability claim were removed from the product UI. Runtime copy identifies an independent, provider-aware product; Models shows the implemented local/Qwen 2.0 states.

**Remaining:** no Qwen Image 3 claim may return without an official source plus implemented provider, license, and acceptance evidence.

### SCM-001: Committed baseline and CI established; reviewed release marker pending

**Evidence:** baseline commit `39b9e3a` is pushed to `main` in `Tnsea/qwenimage3`. Hardening commit `61cf65e` is pushed through draft pull request 1. GitHub Actions run `29995895346` passed strict checks, all 56 tests, Worker checking, the production build, local-artifact scanning, and the blocking production dependency audit; the full development audit is recorded separately.

**Remaining:** review and merge the pull request, then deploy from the reviewed immutable revision instead of treating a pre-review acceptance deployment as a release.

**Acceptance:** successful required CI on the reviewed hardening revision and recorded deployment provenance.

### AUTH-001: Google success path verified; remaining external identity and email flows are unverified

**Evidence:** current health reports Google configured while GitHub and external email remain disabled. Adapter tests exercise Google's authorization URL, PKCE token exchange, verified-profile mapping, exact callback, Cloudflare-compatible redirect handling, and browser-bound state. A real Google account completed the callback on Worker `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3`; D1 recorded one identity mapping and an active browser session, the private Workspace loaded with the one-time starter grant, and no OAuth state remained. Google Auth Platform now reports publishing status `Production` for the external user type, so accounts outside the tester list may authorize.

**Impact:** Google denial/failure behavior, GitHub callback behavior, sender reputation, delivery, and recovery remain unknown.

**Acceptance:** complete Resend and GitHub test accounts plus Google denial/failure paths against the canonical HTTPS origin without exposing tokens.

### UX-001: Critical accessibility and browser acceptance is incomplete

**Evidence:** no automated axe suite, screen-reader record, keyboard checklist, or browser matrix is stored.

**Impact:** navigation, dialogs, menus, accordions, and generation controls may block users despite visual correctness.

**Acceptance:** document desktop/mobile browsers, keyboard-only path, focus behavior, screen-reader flow, reduced motion, and WCAG 2.2 AA findings.

### CONTENT-001: Content inventory is improved but below the stated MVP

**Evidence:** twelve unique prompt records feed eight unique example cards, and the homepage has eleven FAQ answers. The 60-example/80-template editorial target is not met and provenance/review metadata is absent.

**Impact:** discovery pages appear complete but do not meet the editorial depth promised by the product contract.

**Acceptance:** reach the approved inventory with provenance, settings, model/version, review state, and consent metadata.

## P2 — Production Hardening

| ID | Gap | Acceptance direction |
|---|---|---|
| `GEN-001` | Generation remains synchronous; idempotency execution claims, atomic D1 reservation/task creation, stranded-state recovery, and R2 compensation are implemented | Durable queue, cancellation, provider retries |
| `DATA-002` | Versioned additive migrations exist; upgrade/rollback evidence does not | Backup, rollback, downgrade policy, and upgrade tests |
| `DATA-003` | D1/R2 selected and pre-release smoke-tested | Backup/restore, object lifecycle, deletion, and rollback evidence |
| `SEC-001` | Approved host/MIME/signature enforcement is implemented; local provider also checks private-network DNS and redirects | Live provider-host acceptance and DNS/cost monitoring |
| `SEC-002` | Rate limits persist in D1 in Wrangler development and acceptance but remain IP-only | Load acceptance and per-account/API-key budgets |
| `API-001` | Keys have `generations:write` scope; every API attempt records status, duration, and request ID, with valid user/key association | Per-key budgets, alerts, log retention, and documented limits |
| `OPS-001` | No metrics, tracing, durable logs, alerts, or reconciliation job | Production observability and on-call actions |
| `OPS-002` | Cloudflare custom-domain acceptance runtime serves committed source revision `d21ccf9` as Worker `04d02c4e-4843-4e6c-b2a4-6607079c872e`; a pre-migration D1 export and prior Worker identifiers are recorded. Local release verification passed, while GitHub CI for this revision and restore/rollback execution remain unverified | CI evidence, health supervision, backup/restore, and rollback drill |
| `UI-001` | Explicit failed generation states and retry/remove actions are implemented | Accessibility acceptance for failure announcements and focus |
| `WEB-001` | Client/API routing and the previous guest-enabled revision passed broad live smoke. The current account-gated revision passed canonical health/session/catalog, signed-in pricing, yearly-default/monthly-toggle, Checkout-disabled, and redirect checks | Complete the browser matrix, signed-in Studio generation, error routes, and rollback acceptance |

## Launch Decision Rules

- **Wrangler demo:** allowed with the deterministic preview provider, local D1/R2 emulation, no real billing, and explicit development labeling.
- **External beta:** prohibited until every P1 item and applicable legal decision is closed.
- **Public billing:** prohibited until every P0 item passes Stripe test-mode acceptance and reconciliation evidence.
- **Production launch:** prohibited until all P0/P1 items and the selected P2 infrastructure gates are closed, with a committed revision, CI, deployment marker, and canonical live verification.

## Required Decision Record

Before changing this file to Ready, record:

- target Git revision and CI run;
- target environment and canonical URL;
- enabled providers and exact versions;
- migration and rollback identifiers;
- external acceptance evidence;
- privacy/legal/commercial approvals;
- live smoke time and operator;
- every intentionally deferred item and why it is non-blocking.

## Current Acceptance Deployment Record

- Source revision and CI: committed revision `d21ccf95b1736e5b2dc6aed27ab0376636b45bcb`; local `verify:release` passed with 68 tests, while GitHub CI for this revision remains pending
- Worker version: `04d02c4e-4843-4e6c-b2a4-6607079c872e`
- Environment and URL: Cloudflare acceptance, `https://qwen-image-3.net`
- Enabled providers: deterministic local preview and Google OAuth published for external Google accounts; Live Stripe credentials/webhook/catalog are configured but new Checkout remains disabled; Qwen, GitHub, and external email remain disabled
- Applied migrations: `0001`–`0009`; pre-change D1 export retained at ignored path `backups/qwen-image-3-20260723-pre-live-catalog.sql`
- Rollback identifiers: prior Worker `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3`; D1 restore has not been exercised
- Live smoke: July 23, 2026, Asia/Shanghai; health reported D1/R2, fresh maintenance, Google configured, Stripe credentials/webhook/catalog configured, and sales disabled. Session, catalog, canonical redirect, unsigned-webhook rejection, signed event completion, and duplicate replay passed. A signed-in browser confirmed 20 welcome credits, yearly-default and monthly pricing, and disabled Checkout controls. Historical Google acceptance additionally covers real authorization, identity mapping, browser session, one-time starter grant, private Workspace load, and single-use state consumption.
- Operator: repository owner with Codex implementation assistance
- Deferred blockers: all P0/P1 and applicable P2 items above remain blocking

The Worker and client runtime content are represented by committed revision `d21ccf9` and were deployed only after local release verification. The deployment was not produced by GitHub CI, and this record documents acceptance evidence only—not a Ready decision.
