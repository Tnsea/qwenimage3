# Release Readiness

Snapshot: July 23, 2026

Overall state: **BLOCKED FOR EXTERNAL BETA AND PUBLIC BILLING**

The application is locally functional and verified. This file is the authoritative list of remaining launch gates; README and product copy must not convert a pending item into a current guarantee.

## Evidence Already Available

| Evidence | Result |
|---|---|
| TypeScript client/server checks | Pass |
| Automated tests | 39 passed, 0 failed |
| Production bundle | Pass; JavaScript gzip about 87.0 KB |
| npm dependency audit | Blocked: three high-severity development-tool findings through Wrangler/Miniflare/Sharp |
| Local health endpoint | HTTP 200 with local provider and console email |
| Security response headers | CSP, referrer policy, MIME protection, frame denial, permissions policy, COOP present |
| Billing lifecycle regression | Retryable events, strict invoice validation, refund/dispute quarantine, and external-first deletion pass locally |
| Retention/recovery regression | 24-hour guest deletion, stranded-reservation recovery, and maintenance recording pass locally |
| Provider download security | Approved-host, public-DNS, redirect, MIME/signature, and size enforcement pass adapter tests |
| Browser smoke | Desktop, 390 px mobile navigation, signed-in Studio, Billing disabled state, API Activity, and 404 visually verified locally |
| Secret-pattern check | No real credential detected in the working-tree scan; placeholders only |
| Cloudflare acceptance environment | Worker custom domain `qwen-image-3.net`, D1 database, and private R2 bucket deployed; TLS, canonical redirect/metadata, health/session/promotion/generation/asset/watermark smoke passed. Worker version `69a1034f-31ac-45fa-b8e5-e2a9f13e3577` restored the shared catalog contract; a live Chromium regression confirmed the React root, 12 prompt records, rendered homepage, zero application resource failures, and zero runtime exceptions. |
| Stripe sandbox integration | Creator VIP USD 8/month launch and USD 10/month standard Prices plus USD 7/100-credit and USD 18/300-credit Prices created; a dedicated restricted key and webhook signing secret are stored as Worker secrets; an application-created USD 7/100-credit Checkout completed with Stripe's test card, Stripe delivered `checkout.session.completed`, D1 completed the event once, mapped the PaymentIntent, marked the order/payment paid, and granted exactly 100 credits through one ledger row; billing was disabled again before payment completion |

Limitations of this evidence:

- the repository has no commits or CI history;
- real Resend, Google, GitHub, and Qwen credentials were not exercised; Stripe Sandbox credit-pack Checkout and Stripe-origin webhook fulfillment passed once, but no subscription, recurring invoice, asynchronous payment, refund, dispute, Portal, cancellation, or account-deletion lifecycle has passed end to end;
- Docker/Compose execution was unavailable;
- a canonical custom domain and deployment marker exist, but no immutable Git revision exists;
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

### BIL-004: Refund/dispute lifecycle — partially implemented, policy and reconciliation blocked

**Evidence:** PaymentIntents map to product payments; refund/dispute events update payment and order financial status and pause further credit spending with a visible Billing warning. Fulfillment is idempotent.

**Remaining:** approve clawback/negative-balance/support policy, handle every asynchronous failure variant, build reconciliation and alerts, and pass Stripe test-mode end to end.

Public billing stays fail-closed behind `BILLING_ENABLED=false` until every remaining item above passes. This switch blocks new Checkout offers; configured webhook verification and Stripe-side cleanup continue so already-created financial state can drain safely.

## P1 — External Beta Blockers

### DATA-001: 24-hour guest retention — local and scheduled Cloudflare implementation, lifecycle evidence pending

**Evidence:** guest list/asset access excludes generations older than 24 hours locally. Local startup/15-minute maintenance and a deployed Worker cron delete old guest rows/assets and recover stale reservations; automated local recovery/retention tests pass.

**Remaining:** observe a real scheduled Cloudflare deletion, approve policy, instrument overdue D1/R2 storage, and prove backup deletion.

### BRAND-001: Unsupported Qwen Image 3 release claim — closed locally

**Evidence:** the release date/link and every Qwen Image 3 availability claim were removed from the product UI. Runtime copy identifies an independent, provider-aware product; Models shows the implemented local/Qwen 2.0 states.

**Remaining:** no Qwen Image 3 claim may return without an official source plus implemented provider, license, and acceptance evidence.

### SCM-001: No committed source baseline

**Evidence:** branch `main` has no commits and every project source/document path is untracked.

**Impact:** no trustworthy revision, diff, rollback point, CI target, or deployment provenance.

**Acceptance:** review secrets and generated files, commit an intentional baseline, configure required CI, and build releases from an immutable revision.

### AUTH-001: External identity and email flows are unverified

**Evidence:** current health reports Google and GitHub disabled and console email enabled. Adapter tests mock provider responses.

**Impact:** callback, consent, sender reputation, delivery, and recovery behavior remain unknown.

**Acceptance:** complete Resend plus Google/GitHub test accounts against the canonical HTTPS origin, including denial and failure paths, without exposing tokens.

### UX-001: Critical accessibility and browser acceptance is incomplete

**Evidence:** no automated axe suite, screen-reader record, keyboard checklist, or browser matrix is stored.

**Impact:** navigation, dialogs, menus, accordions, and generation controls may block users despite visual correctness.

**Acceptance:** document desktop/mobile browsers, keyboard-only path, focus behavior, screen-reader flow, reduced motion, and WCAG 2.2 AA findings.

### CONTENT-001: Content inventory is improved but below the stated MVP

**Evidence:** twelve unique prompt records feed eight unique example cards, and the homepage has ten FAQ answers. The 60-example/80-template editorial target is not met and provenance/review metadata is absent.

**Impact:** discovery pages appear complete but do not meet the editorial depth promised by the product contract.

**Acceptance:** reach the approved inventory with provenance, settings, model/version, review state, and consent metadata.

## P2 — Production Hardening

| ID | Gap | Acceptance direction |
|---|---|---|
| `GEN-001` | Generation remains synchronous; stranded reservations are now repaired by maintenance | Durable queue, monotonic task states, cancellation, provider retries |
| `DATA-002` | Versioned additive migrations exist; upgrade/rollback evidence does not | Backup, rollback, downgrade policy, and upgrade tests |
| `DATA-003` | D1/R2 selected and pre-release smoke-tested | Backup/restore, object lifecycle, deletion, and rollback evidence |
| `SEC-001` | Approved host/MIME/signature enforcement is implemented; local provider also checks private-network DNS and redirects | Live provider-host acceptance and DNS/cost monitoring |
| `SEC-002` | Rate limits persist in SQLite locally and D1 in pre-release but remain IP-only | Load acceptance and per-account/API-key budgets |
| `API-001` | Keys have `generations:write` scope and durable request logs | Per-key budgets, alerts, log retention, and documented limits |
| `OPS-001` | No metrics, tracing, durable logs, alerts, or reconciliation job | Production observability and on-call actions |
| `OPS-002` | Cloudflare custom-domain acceptance runtime is deployed; recovery path remains unverified | Immutable revision, health supervision, backup/restore, rollback |
| `UI-001` | Explicit failed generation states and retry/remove actions are implemented | Accessibility acceptance for failure announcements and focus |
| `WEB-001` | Pages/client/API routing and primary guest flow passed live smoke; the client, local adapter, and Worker now share the catalog contract, and the canonical domain passed a post-deploy Chromium render with zero runtime exceptions | Browser matrix, signed-in Studio, error routes, and rollback acceptance |

## Launch Decision Rules

- **Local demo:** allowed with the local provider, console email, no real billing, and explicit local-only labeling.
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

No such record exists yet.
