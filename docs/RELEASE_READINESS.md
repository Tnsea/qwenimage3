# Release Readiness

Snapshot: July 25, 2026

Overall state: **CHECKOUT ENABLED IN ACCEPTANCE; BLOCKED FOR EXTERNAL BETA AND PRODUCTION APPROVAL**

The application is locally functional and verified. This file is the authoritative list of remaining launch gates; README and product copy must not convert a pending item into a current guarantee.

## Evidence Already Available

| Evidence | Result |
|---|---|
| TypeScript client/server checks | Pass |
| Automated tests | 119 passed, 0 failed on July 25, 2026. Coverage includes durable standard/priority queue submission, owned status polling, terminal refund, persisted Kie task resumption, and the existing account, credit, provider, billing, maintenance, OAuth, analytics, security, Studio, and editorial contracts |
| Production bundle | Pass; JavaScript gzip 133.88 KB, below the 180 KB product target; artifact scan rejects loopback addresses, SQLite customer copy, and development-token copy |
| npm dependency audit | Production and full development dependency audits pass with zero findings after upgrading Wrangler to 4.114.0 and Miniflare to 4.20260722.0 |
| Static UI quality | Strict unused checks, React Hooks rules, and baseline JSX accessibility rules pass |
| Local health endpoint | HTTP 200 from the Wrangler Worker with local D1/R2 emulation, deterministic preview provider, and email disabled unless explicitly configured |
| Security response headers | CSP, referrer policy, MIME protection, frame denial, permissions policy, COOP present |
| Billing lifecycle regression | Retryable events, strict invoice validation, refund/dispute/Radar quarantine, consolidated operator review, non-negative recovery, versioned policy acceptance, scheduled alert delivery, and external-first deletion pass locally |
| Retention/recovery regression | Legacy 24-hour guest deletion, stranded account-reservation recovery, maintenance recording, and R2 deletion compensation are implemented; the first post-deploy scheduled acceptance pass completed successfully at `2026-07-23T09:30:08Z` and health reported it fresh |
| D1 restore rehearsal | The July 25 remote export passed local integrity checking and imported into isolated D1 database `cf8c1fed-2db2-43ac-bb71-b3d7499d99b6`; seven core count/invariant checks matched the source, and seven referenced R2 keys matched seven bucket objects. Binding promotion, backup deletion, and full R2 byte restoration remain unverified |
| Provider download security | The Alibaba adapter's approved-host/public-DNS/redirect/MIME/signature/size controls and the Kie.ai adapter's exact API/result-host, redirect, MIME/signature, and size controls pass locally |
| Browser smoke | The current local Worker bundle rendered Studio Overview, Create, and Settings in the revised graphite/amber dark theme and the light alternative. Desktop and 390 px layouts had no horizontal overflow or console warning/error. The four new editorial routes were also verified at desktop and 390 px: desktop sticky/mobile collapsed tables of contents switched correctly, comparison-table overflow remained contained, all 50 prompt cards rendered, Copy changed state only after clipboard success, Try prefilled without generation, and a 1,000-character query was bounded to the 800-character generator contract. The Findly.tools recognition badge previously rendered at the bottom of the site footer, remained outside the generator area, and loaded from its exact CSP-approved image host without browser warnings in canonical acceptance. Current canonical HTML confirms that Startup Fame remains absent and that Findly.tools and Software Bolt share a horizontal responsive row after the copyright line, wrapping only when narrow space requires it. The 390 px Settings verification alert was caught overlapping during review, fixed to a row-flow grid with a full-width action, and reverified visually. Earlier evidence retains generation handoff, download, variation, favorite, delete, pricing, trust routes, mobile navigation, authentication, failure handling, and 404 coverage. A prior signed-in Kie.ai generation completed the provider, credit, R2, browser-rendering, and authenticated-download path. |
| Google OAuth acceptance | Worker version `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3` completed a real Google authorization-code and PKCE callback, created one identity mapping and browser session, granted starter credits once, entered the private Workspace, consumed the OAuth state, and was subsequently published for external Google accounts |
| Secret-pattern check | No real credential detected in the working-tree scan; placeholders only |
| Cloudflare acceptance environment | Worker custom domains `qwen-image-3.net` and `www.qwen-image-3.net`, D1, private R2, standard/priority generation queues, Email Routing, and the 15-minute maintenance/alert trigger are deployed. Forward migrations `0001`–`0014` are applied. Commit `cd2d2c5` runs as Worker `90428382-3497-4f92-99be-39bf4f371a58`; health reports `ok`, fresh maintenance, Kie.ai selected/configured, billing enabled with Stripe credentials/webhook/catalog configured, healthy external alerting, zero failed/stale billing events, and zero open/unrecovered reviews. Canonical HTML serves `/assets/index-CECAlxYX.js` and `/assets/index-B2wyR_VK.css`. A signed-in browser observed a new Create turn move from `Submitting` to `Generating` to `Complete`; the 2048×2048 private result loaded, balance moved from 12 to 8 with zero reserved, D1 retained one reservation/settlement pair plus the provider task ID/R2 key, and the browser console returned zero warnings/errors. Local tests cover the `Queued` and terminal-failure/refund states. Existing public-route, canonical, noindex, footer, catalog, OAuth, billing, and SEO evidence remains applicable. The Pages fallback remains deployment `623d913e.qwen-image-3.pages.dev` and was not redeployed. |
| Stripe integration | The replacement Starter/Creator/Professional monthly/yearly and 400/1,200/3,000-credit pack Prices exist in both Live and the isolated Stripe Sandbox; all nine Sandbox Price amounts, currencies, and intervals match D1. Sandbox Worker `2238ec7f-7aed-451f-b204-a1ebb8078d62` at `sandbox.qwen-image-3.net` completed a USD 12/400-credit Checkout; Starter, Creator, and Professional monthly/yearly subscriptions with exact grants; Stripe Portal display and scheduled cancellation; a successful Test Clock renewal; failed renewal, `past_due`, and payment recovery; terminal cancellation; full refund; dispute; actionable Radar early-fraud-warning lifecycle; missing-order reconstruction; and active/trialing/past-due/already-canceled/cancel-at-period-end account deletion. A trial invoice that arrived before account deletion completed on replay after deletion through the billing tombstone. The exercise caught and fixed out-of-order Radar delivery, Stripe's current `cancel_at` Portal payload, already-missing Stripe cleanup, and late financial webhook races. Worker `b5ee6271-4cca-46d8-840f-6f6d8745dc6b` then accepted authenticated risk resolution: unauthorized access failed, Radar and dispute cases cleared, a refund could not be falsely cleared, 400 credits were recovered exactly once, and review health returned to zero. Checkout exposed only synchronous `card` and `link`; its asynchronous-success handler remains signed-event tested but cannot be exercised externally while delayed methods are disabled. The Sandbox Worker restricted key was rotated after acceptance and the exposed Sandbox-only keys were expired. A synthetic failed event changed health to `degraded`, and resolving it restored `ok` with billing event health `0 failed / 0 stale`. Live mode has a dedicated restricted key and 10-event webhook destination. By explicit repository-owner decision, canonical Worker `90428382-3497-4f92-99be-39bf4f371a58` retains new Checkout creation for acceptance operation; this is not production approval. |

Source-control evidence:

- baseline commit `39b9e3a` is pushed to `Tnsea/qwenimage3`;
- Studio action and cleanup commit `532215a`, canonical catalog cleanup commit `efe7104`, and model-table cleanup commit `dd38e44` are pushed on `codex/worker-online-hardening`;
- durable-queue commit `cd2d2c5` is pushed, passed the full local release command, passed GitHub Actions run `30155611482`, and is deployed as acceptance Worker `90428382-3497-4f92-99be-39bf4f371a58`;
- GitHub Actions run `30062662075` passed the full CI workflow with 99 tests and zero dependency-audit findings for pull request 1.

Limitations of this evidence:

- real Resend, GitHub, and Alibaba Qwen credentials were not exercised; Kie.ai completed one direct Worker task and one signed-in success path, while failure/moderation/timeout/late-completion behavior and provider commercial approval remain open; Google completed one successful acceptance sign-in but its denial/failure paths remain open; Stripe delayed payment methods are disabled, so no real `checkout.session.async_payment_succeeded` event can be generated by the current `card`/`link` Checkout contract;
- Docker/Compose execution was unavailable;
- the deployed Worker is an acceptance revision, not a production approval or a reviewed release marker;
- no formal accessibility, browser-matrix, load, restored-binding promotion, Worker rollback, or external security review exists.
- Stripe's default Sandbox standard secret was rotated by the account owner after setup. The Worker continues to use the separate restricted key.

## P0 — Production Billing Approval Blockers

### BIL-001: External-first account deletion — Stripe Sandbox acceptance complete

**Evidence:** `DELETE /api/account` cancels a stored Stripe subscription, deletes the Stripe Customer, and only then removes local data. A mocked integration test proves that customer-deletion failure returns 502 and preserves the local user. Sandbox cases passed for active, trialing, past-due, already canceled, and cancel-at-period-end subscriptions. Already-missing Stripe objects are treated as idempotent cleanup, while any other external error preserves the account. The deletion audit retains Customer/subscription identifiers and payment tombstones so late Checkout, invoice, refund, dispute, and Radar events complete as audited no-ops instead of retrying forever.

**Remaining:** approve the retention language and customer-support procedure; no Stripe lifecycle acceptance case remains for this item.

### BIL-002: Recoverable webhook fulfillment — locally closed, Stripe acceptance pending

**Evidence:** events use `processing`, `failed`, and `completed` states with attempt counts and stale-lock recovery. Missing local records return a retryable status; a regression test delivers the event before the order and succeeds on replay after the order appears. With new Checkout disabled, Stripe delivered the real Sandbox `checkout.session.completed` event for the paid credit-pack session; D1 completed it in one attempt, created one PaymentIntent mapping and one purchase ledger row, and granted exactly 100 credits. A separate signed acceptance event also returned the duplicate response on replay. Webhook settlement and Stripe cleanup remain available while new sales are paused.

**Additional Sandbox evidence:** the current catalog completed Stripe-origin Checkout and invoice delivery. Radar and dispute events arrived before their corresponding Checkout event, received a retryable 503, and completed on the second Stripe delivery after the local payment existed. The Radar record preserved paid/normal financial state while separately blocking spending; the dispute changed financial state and blocked spending.

**Additional Sandbox evidence:** Test Clocks completed a successful monthly renewal, exact second credit grant, a failed renewal that moved the account to `past_due`, and a successful payment retry that restored the plan and granted exactly once. Terminal subscription deletion completed. A deliberately deleted local order was reconstructed from Checkout metadata and fulfilled once. Account-deletion races completed through deletion audits and payment tombstones. The health endpoint now reports failed and stale billing-event counts and degrades when either count is non-zero. The final seven-query D1 reconciliation found zero failed/stale events, price mismatches, missing grants, missing credit payments, or duplicate grant references.

**Local alerting evidence:** the 15-minute schedule now evaluates failed/stale events and open/unrecovered reviews, deduplicates by incident fingerprint, repeats after six hours, sends one recovery, and records delivery state in D1. A protected idempotent route sends a configuration-test email without fabricating a financial event. Mocked binding delivery passes.

**External alert acceptance:** Email Routing is enabled for `qwen-image-3.net`, the destination is verified, and the Worker binding plus managed destination/operator secrets are active. The idempotent test `alert-acceptance-20260723-b95303e` returned `delivered`, D1 recorded delivery at `2026-07-23T15:57:38.199Z`, and Cloudflare Activity Log reported the exact subject, sender, destination, and result `Delivered`. The subsequent 15-minute schedule recorded a healthy check with no delivery error.

**Remaining:** delayed payment is not reachable while Checkout is restricted to synchronous `card` and `link`; the shared asynchronous-success handler has signed-event coverage.

### BIL-003: Creator invoice validation — locally closed, Stripe acceptance pending

**Evidence:** a Creator grant requires the known Customer/subscription, a known immutable Price-version row, paid status, matching USD amount, allowed billing reason, invoice ID, and PaymentIntent. Checkout uses only the active version, while old subscriptions continue to grant the historical credits carried by their retired Price ID. Orders and payments retain the Price ID; invalid Price/amount/currency receives 422 and grants nothing. Regression coverage switches the active standard plan from USD 10/300 credits to USD 12/450 credits and proves both old and new invoice contracts remain idempotent.

**Additional Sandbox evidence:** Starter monthly charged USD 9.90 and granted 500 credits from its paid invoice. Starter yearly charged USD 99, recorded a one-year period, and granted 6,000 credits exactly once. Portal scheduled cancellation used Stripe's current `cancel_at` field; the Worker now recognizes both it and `cancel_at_period_end`.

**Additional Sandbox evidence:** Creator monthly/yearly charged USD 29.90/USD 299 and granted 2,000/24,000 credits. Professional monthly/yearly charged USD 59.90/USD 599 and granted 5,000/60,000 credits. Checkout reported automatic tax disabled, no discounts, exact subtotal/total, and USD currency. Portal configuration allows cancellation and payment-method updates but disables subscription plan updates, so the accepted contract has no discount, tax, or proration path.

**Remaining:** any future enablement of taxes, promotion codes, customer balance, or Portal plan updates requires a new Price-version policy and a fresh acceptance pass.

### BIL-004: Refund/dispute/fraud-warning lifecycle — Sandbox lifecycle, product copy, and external alert accepted

**Evidence:** PaymentIntents map to product payments; refund/dispute events update payment and order financial status and pause generation and Checkout. Actionable Radar early fraud warnings resolve Charge-to-PaymentIntent using least-privilege read access, store separate risk evidence, and pause spending without changing the paid/refunded/disputed status. All actionable events for one PaymentIntent are consolidated into one review. Authenticated operator actions require a stable operator identity, note, and idempotency key. A cleared Radar false positive or won dispute restores access only when no other review or unrecovered loss remains. A confirmed loss recovers no more than available credits, writes a ledger adjustment, never creates a negative balance, and remains blocked while any exposure is unrecovered.

**Additional Sandbox evidence:** the official early-fraud-warning test card produced an actionable `made_with_stolen_card` warning. The first out-of-order delivery failed safely, the retry recorded the warning, kept the payment and order paid/normal, and blocked credit spending with HTTP 423. A full refund marked payment/order refunded and blocked spending. The dispute test marked payment/order disputed after its own safe out-of-order retry and blocked spending.

**Local resolution evidence:** one regression case clears a Radar false positive without changing credits, reopens the same review when a refund arrives, rejects clearing a completed refund, reclaims only four currently available credits from a 400-credit exposure, keeps the remaining 396 credits blocked, replays the first decision without a second mutation, later recovers exactly the remaining 396 credits, and unblocks with a non-negative balance. The review retains both Stripe triggers and every operator action.

**Sandbox resolution evidence:** committed revision `8cdf34f` deployed as Worker `b5ee6271-4cca-46d8-840f-6f6d8745dc6b` after a D1 export and migration `0011`. The migration backfilled one Stripe refund, one dispute, and one actionable Radar warning into three open reviews, changing health to `degraded`. Unauthenticated listing returned `401`. The Radar case cleared and an identical idempotency-key replay returned the original action. The refund rejected `cleared` with `409`, then reclaimed exactly 400 credits and left the refunded financial state intact. The synthetic dispute cleared as a won test case and restored paid/normal state. Final D1 reconciliation found three resolved reviews, three unique actions, one `-400` recovery ledger row, zero open or unrecovered cases, zero invalid exposures or negative balances, zero blocked reviewed accounts, and zero failed/processing billing events. Health returned to `ok`.

**Local policy and alert evidence:** `/pricing`, `/terms`, `/refund-policy`, and `/studio/billing` expose the material renewal, cancellation, credit, refund, and review rules. A pricing offer selection is a clearly disclosed affirmative confirmation: the client records the current-version acceptance and opens Stripe Checkout without a second purchase click, resuming the selected offer after Google sign-in when necessary. Studio retains its explicit checkbox flow. D1 records either acceptance path, and Checkout stores that version/time locally and in Stripe metadata. The exact approved policy copy and source digest are tracked in [Billing Terms Copy Approval](./BILLING_TERMS_APPROVAL.md). The aggregate alert route includes open and unrecovered reviews.

**Product-owner copy approval:** policy version `2026-07-23` was approved without requested changes at `2026-07-23T15:53:01Z`; the exact source digest and decision are recorded in [Billing Terms Copy Approval](./BILLING_TERMS_APPROVAL.md). This is product-copy approval, not a substitute for launch-region legal review.

**External acceptance:** Worker `7bfce1bd-6785-4e60-a30e-610ea5346ba1` serves the approved copy on both canonical policy routes, the server requires current-version acceptance before Checkout, and the external alert test is recorded as Delivered. The scheduled path then completed at `2026-07-23T16:00:13.104Z` with zero failed/stale events, zero open/unrecovered reviews, and no alert error.

**Remaining:** launch-region legal/commercial review still applies. The non-negative partial-recovery path is covered by the Worker integration suite; a future real partial Stripe refund should be added to external acceptance before relying on partial refunds operationally. The repository owner explicitly enabled canonical acceptance Checkout on July 24, 2026; that decision does not close these production-approval gates.

Billing remains fail-closed by default. The canonical acceptance deployment uses an explicit repository-owner `BILLING_ENABLED=true` override; configured webhook verification and Stripe-side cleanup continue independently of the switch. The override is limited to acceptance operation and is not a Ready or production-approval decision.

## P1 — External Beta Blockers

### DATA-001: Legacy guest cleanup — local and scheduled Cloudflare implementation, lifecycle evidence pending

**Evidence:** new anonymous generation is disabled in the current code. Local startup/15-minute maintenance and the deployed Worker cron retain the old 24-hour deletion path so previously created guest rows/assets can drain safely; automated recovery/retention tests pass. The first post-deploy cron pass completed at `2026-07-23T09:30:08Z`, and the live health response reported `completed` and fresh.

**Remaining:** observe an actual expired-object deletion in Cloudflare, approve policy, instrument overdue D1/R2 storage, and prove backup deletion.

### BRAND-001: Qwen Image 3 source and availability boundary — closed locally

**Evidence:** Qwen officially published Qwen-Image-3.0 on July 21, 2026. The four local SEO pages cite that primary source and Alibaba Cloud's invite-only API reference, distinguish official demonstrations from independent testing, and state that the site has not implemented, selected, or externally accepted an Image 3 provider. Models keeps Image 3 unavailable, while the canonical acceptance runtime remains Kie.ai Qwen Image 2.

**Remaining:** publication of factual Image 3 editorial content does not authorize availability language. Do not label Image 3 available until an adapter, provider license, commercial gate, failure/timeout behavior, and external acceptance are verified.

### SCM-001: Committed baseline and CI established; reviewed release marker pending

**Evidence:** baseline commit `39b9e3a` is pushed to `main` in `Tnsea/qwenimage3`. Draft pull request 1 tracks the hardening branch. Create-conversation commit `1d6e731` deployed as Worker `15017717-b14a-42e3-8a9f-c7a4afa7c96a`; follow-up `33640c8` passed GitHub Actions run `30154996131`. Durable-queue commit `cd2d2c5` passed the full local release command with 119 tests, passed GitHub Actions run `30155611482`, and deployed as Worker `90428382-3497-4f92-99be-39bf4f371a58`.

**Remaining:** review and merge the pull request, then deploy from the reviewed immutable revision instead of treating a pre-review acceptance deployment as a release.

**Acceptance:** successful required CI on the reviewed hardening revision and recorded deployment provenance.

### AUTH-001: Google success path verified; remaining external identity and email flows are unverified

**Evidence:** current health reports Google configured while GitHub and external email remain disabled. Adapter tests exercise Google's authorization URL, PKCE token exchange, verified-profile mapping, exact callback, Cloudflare-compatible redirect handling, and browser-bound state. A real Google account completed the callback on Worker `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3`; D1 recorded one identity mapping and an active browser session, the private Workspace loaded with the one-time starter grant, and no OAuth state remained. Google Auth Platform now reports publishing status `Production` for the external user type, so accounts outside the tester list may authorize.

**Impact:** Google denial/failure behavior, GitHub callback behavior, sender reputation, delivery, and recovery remain unknown. The customer UI is Google-only, while its Settings password and account-deletion recovery copy still depend on retained password/email capabilities that are not available through the canonical sign-in UI; that account-control path needs a reviewed Google reauthentication or credential-bootstrap decision before external beta.

**Acceptance:** complete Google denial/failure paths against the canonical HTTPS origin without exposing tokens, decide and verify the Google-only password/account-deletion path, and complete Resend/GitHub acceptance before either retained capability is exposed.

### MODEL-001: Kie.ai Qwen Image 2 signed-in success path is externally verified; failure/timeout gates pending

**Evidence:** the Worker implements the documented `qwen2/text-to-image` task contract, bounded polling, immediate private R2 ingestion, exact API/result-host enforcement, redirect revalidation, image MIME/signature/size checks, and safe error mapping. The fixed 2K model is exposed only as a four-credit Standard generation with documented ratios and an 800-character prompt limit; both the client and server reject unsupported settings before provider spend. Catalog availability is fail-closed unless the exact model and complete Kie configuration are selected. Mocked integration tests cover one successful task, resumption from a persisted task ID without duplicate creation, an unapproved result host, provider failure, unsupported settings, durable queue completion, and terminal refund. A dedicated Kie key restricted to Qwen Image 2.0 was created on July 24, 2026, stored as a managed Worker secret, and capped at 200 hourly, 1,000 daily, and 4,000 lifetime Kie credits. Earlier direct probes and signed-in generation `9cc97bfb-5dfd-4d46-9815-d08ccec64510` established provider charge, private persistence, settlement, rendering, and private-download behavior. On July 25, Worker `90428382-3497-4f92-99be-39bf4f371a58` accepted signed-in standard-queue generation `b8a24ffa-9bd9-46be-9214-9624d1b4abeb`: Create showed `Submitting`, then `Generating`, then `Complete`; D1 recorded `queue_tier=free`, a non-null processing start, provider task ID, and R2 key; the ledger stored `generation_reservation -4` plus `generation_settlement 0`; balance became 8 available/0 reserved; and the browser loaded a 2048×2048 owned image with no warning/error.

**Impact:** provider-side access, current task price, provider balance deduction, polling, result host, PNG download, signed-in D1 reservation/settlement, private R2 persistence, browser rendering, output dimensions, and private-download enforcement are observed. The current branch moves provider execution to durable standard/priority queues, persists the Kie task ID, resumes it on bounded transient retries, exposes owned polling, and refunds terminal failures. Moderation/failure behavior, canonical timeout recovery, late task completion, data/commercial terms, production load, and queue/cost monitoring remain unaccepted. Provider task creation and the following D1 task-ID write cannot be atomic, leaving a small duplicate-cost window if that write fails.

**Acceptance:** deploy and exercise the queue, then test provider failure, moderation, timeout, late-completion, and product-credit refund behavior; approve the provider contract; add queue/cost supervision; and record the production risk decision.

### UX-001: Critical accessibility and browser acceptance is incomplete

**Evidence:** no automated axe suite, screen-reader record, keyboard checklist, or browser matrix is stored.

**Impact:** navigation, dialogs, menus, accordions, and generation controls may block users despite visual correctness.

**Acceptance:** document desktop/mobile browsers, keyboard-only path, focus behavior, screen-reader flow, reduced motion, and WCAG 2.2 AA findings.

### CONTENT-001: Curated editorial inventory expanded; reviewed-example target remains open

**Evidence:** the repository now contains 50 original curated Qwen Image 3 prompt templates across five categories, eight existing example cards, and 15 homepage FAQ answers generated from the same records as the homepage FAQ schema. Each curated prompt reserves structured test-record fields, but all 50 remain explicitly `not-run` and the page therefore uses “Curated Examples,” not “Tested & Curated.”

**Impact:** the new SEO library is truth-safe and materially deeper, but it still does not satisfy the product contract's 60 reviewed examples or 80 reviewed prompt templates, and no prompt-level Qwen Image 3 results have been accepted.

**Acceptance:** add at least 60 reviewed examples and 80 reviewed prompt templates with provenance, settings, model/version, review state, and consent metadata; switch the prompt page to “Tested & Curated” only after at least 50 complete Qwen Image 3 test records exist.

## P2 — Production Hardening

| ID | Gap | Acceptance direction |
|---|---|---|
| `GEN-001` | Durable standard/priority queues have one producer and consumer each; signed-in canonical submission, task-ID persistence, status polling, completion, R2 storage, and settlement pass. Bounded retries and terminal refund pass locally | Canonical failure/timeout/refund lifecycle, cancellation policy, late-completion reconciliation, queue/cost supervision |
| `DATA-002` | Versioned additive migrations and an isolated D1 export/import/count rehearsal pass; binding promotion and Worker rollback do not | Restored-binding promotion, rollback policy, and forward-migration compatibility drill |
| `DATA-003` | D1/R2 selected and pre-release smoke-tested; seven D1 object references matched seven R2 objects during the restore rehearsal | Full R2 backup/restore, object lifecycle, backup deletion, and rollback evidence |
| `SEC-001` | Approved host/MIME/signature enforcement is implemented; local provider also checks private-network DNS and redirects | Live provider-host acceptance and DNS/cost monitoring |
| `SEC-002` | Rate limits persist in D1 in Wrangler development and acceptance but remain IP-only | Load acceptance and per-account/API-key budgets |
| `API-001` | Keys have `generations:write` scope; every API attempt records status, duration, and request ID, with valid user/key association | Per-key budgets, alerts, log retention, and documented limits |
| `OPS-001` | Cloudflare invocation logs and aggregate billing-health email alerts are active; broader metrics, tracing, financial reconciliation, and on-call supervision are absent | Production observability and on-call actions |
| `OPS-002` | The current Cloudflare custom-domain acceptance revision and Worker are recorded below; pre-migration exports, isolated D1 restore evidence, forward migrations, alert evidence, GA4 evidence, and rollback Worker identifiers are retained. Restored-binding promotion and Worker rollback remain unverified | CI evidence, health supervision, restored-binding promotion, and Worker rollback drill |
| `UI-001` | Acceptance Worker `90428382-3497-4f92-99be-39bf4f371a58` renders seven prior/current Create turns and a fixed composer; canonical desktop showed submitting/generating/complete status, visible keyboard focus through the first six controls, no horizontal overflow, and no console warning/error. Local desktop/mobile evidence covers queued/failed states | Automated axe, screen-reader, full keyboard/reduced-motion, canonical mobile, and terminal-failure acceptance |
| `WEB-001` | Client/API routing, account-gated generation, the deployed Create conversation, signed-in pricing, Checkout gate behavior, legacy Prompts redirect, and the new durable paid-provider success lifecycle have acceptance evidence | Canonical failure/error routes, broader Studio-action/browser matrix, load, and rollback acceptance |

## Launch Decision Rules

- **Wrangler demo:** allowed with the deterministic preview provider, local D1/R2 emulation, no real billing, and explicit development labeling.
- **External beta:** prohibited until every P1 item and applicable legal decision is closed.
- **Acceptance Checkout:** may be externally reachable only through an explicit owner/operator decision recorded with the committed configuration, deployed Worker version, and live health/catalog verification. The current July 24, 2026 decision applies only to the canonical acceptance environment.
- **Production-approved public billing:** prohibited until every P0 item, applicable legal/commercial decision, reconciliation control, and release marker is complete. Acceptance Checkout enablement does not satisfy this rule.
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

- Source revision and CI: deployed commit `cd2d2c5f2cbd47e25ad364a4aed359da898e88c7`; local release verification passed with 119 tests, production artifact scanning, and zero production dependency findings; GitHub Actions run `30155611482` passed the same check/test/build/artifact/production-audit workflow
- Worker version: `90428382-3497-4f92-99be-39bf4f371a58`
- Environment and URLs: Cloudflare acceptance at `https://qwen-image-3.net`; Pages fallback at `https://qwen-image-3.pages.dev`, immutable Pages deployment `https://623d913e.qwen-image-3.pages.dev`
- Enabled providers/resources: Kie.ai Qwen Image 2; standard queue `qwen-image-3-generation` (`421931de159f4de3803299f0da1d2019`); priority queue `qwen-image-3-generation-priority` (`306e5cd64750403486d2c6a6033b615f`); Google OAuth published for external accounts; Cloudflare Email Routing billing alerts; and Live Stripe Checkout for all nine offers by explicit repository-owner acceptance decision. Deterministic local preview remains local/Pages-only; Alibaba Qwen, GitHub, and transactional account email remain disabled
- Applied migrations: `0001`–`0014`; pre-migration D1 export retained at ignored path `backups/qwen-image-3-20260725-184500.sql`
- Rollback identifiers: immediate predecessor Worker `15017717-b14a-42e3-8a9f-c7a4afa7c96a` is the pre-queue Create-conversation revision. Billing-disabled Worker `a84277dd-c81d-4944-a4da-418aaec1f959` remains the rollback for shutting off new Checkout. D1 export `backups/qwen-image-3-20260725-184500.sql` (SHA-256 `3c7b7650a2434b8a35c7caa7262883ba424f196f8b05ee3db75c206e70300050`) imported successfully into isolated rehearsal database `cf8c1fed-2db2-43ac-bb71-b3d7499d99b6`; restored-binding promotion and actual Worker rollback have not been exercised. Migration `0014` is additive, so the immediate predecessor can ignore its new nullable column during an application rollback
- Live smoke: July 25, 2026, 19:08 Asia/Shanghai; canonical health reported `ok`, Worker `90428382-3497-4f92-99be-39bf4f371a58`, D1/R2, fresh maintenance, Kie.ai selected/configured, billing enabled, configured Stripe credentials/webhook/catalog, zero failed/stale events, zero open/unrecovered reviews, and healthy alerting. Both queues report one producer and one consumer. Canonical HTML loaded `/assets/index-CECAlxYX.js` and `/assets/index-B2wyR_VK.css`. A signed-in Chrome session loaded seven historical/current turns, submitted generation `b8a24ffa-9bd9-46be-9214-9624d1b4abeb`, observed `Submitting` and `Generating`, and reached in-place `Complete` about 12 seconds later. The 2048×2048 private image loaded; D1 confirmed the Kie provider/model, processing start, provider task ID, R2 key, reservation/settlement, and 8 available/0 reserved credits. Desktop width 1,470 px had 1,455 px document width, the first six Tab stops were visible, and the console returned zero warning/error. Canonical mobile, terminal provider failure/timeout, and formal accessibility remain open. The Pages fallback was not redeployed.
- Operator: repository owner with Codex implementation assistance
- Deferred blockers: all P0/P1 and applicable P2 items above remain blocking

The current Worker and client runtime content are represented by committed revision `cd2d2c5f2cbd47e25ad364a4aed359da898e88c7`. Review, merge, and a release marker remain pending. This record documents acceptance evidence and the explicit Checkout operating decision only—not a Ready or production-approval decision.
