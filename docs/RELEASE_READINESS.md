# Release Readiness

Snapshot: July 24, 2026

Overall state: **CHECKOUT ENABLED IN ACCEPTANCE; BLOCKED FOR EXTERNAL BETA AND PRODUCTION APPROVAL**

The application is locally functional and verified. This file is the authoritative list of remaining launch gates; README and product copy must not convert a pending item into a current guarantee.

## Evidence Already Available

| Evidence | Result |
|---|---|
| TypeScript client/server checks | Pass |
| Automated tests | 102 passed, 0 failed, including direct successful-generation handoff to private Studio history, retained Studio download/favorite/variation/retry/delete controls, persistent Studio theme selection and mobile verification-layout protection, and no inline result galleries; Kie.ai task creation/polling/download, exact result-host enforcement, and unsupported-setting rejection; default-on GA4 page views with advertising signals disabled; account-required generation; exactly-once welcome credits; 4/8/16 credit charging for multi-tier providers; Starter-versus-Creator entitlements; shared three-plan homepage/full-pricing rendering with yearly default; disclosed pricing-to-Checkout handoff; explicit versioned policy acceptance; idempotent alert test delivery; alert deduplication/reminder/recovery; per-route self-referencing canonical metadata; unsupported-model rejection; stable non-JSON edge errors; concurrent D1 credits/idempotency; asynchronous Worker Stripe replay; out-of-order Radar fraud-warning retry/quarantine; authenticated and non-negative billing-review resolution; current Stripe Portal cancellation payloads; account-deletion billing tombstones; billing-event/review health degradation; maintenance repeatability; origin isolation; reviewed analytics CSP hosts; HTML transformation prevention; and external-policy contracts |
| Production bundle | Pass; JavaScript gzip 101.29 KB; artifact scan rejects loopback addresses, SQLite customer copy, and development-token copy |
| npm dependency audit | Production and full development dependency audits pass with zero findings after upgrading Wrangler to 4.114.0 and Miniflare to 4.20260722.0 |
| Static UI quality | Strict unused checks, React Hooks rules, and baseline JSX accessibility rules pass |
| Local health endpoint | HTTP 200 from the Wrangler Worker with local D1/R2 emulation, deterministic preview provider, and email disabled unless explicitly configured |
| Security response headers | CSP, referrer policy, MIME protection, frame denial, permissions policy, COOP present |
| Billing lifecycle regression | Retryable events, strict invoice validation, refund/dispute/Radar quarantine, consolidated operator review, non-negative recovery, versioned policy acceptance, scheduled alert delivery, and external-first deletion pass locally |
| Retention/recovery regression | Legacy 24-hour guest deletion, stranded account-reservation recovery, maintenance recording, and R2 deletion compensation are implemented; the first post-deploy scheduled acceptance pass completed successfully at `2026-07-23T09:30:08Z` and health reported it fresh |
| Provider download security | The Alibaba adapter's approved-host/public-DNS/redirect/MIME/signature/size controls and the Kie.ai adapter's exact API/result-host, redirect, MIME/signature, and size controls pass locally |
| Browser smoke | The current local Worker bundle rendered Studio Overview, Create, and Settings in the revised graphite/amber dark theme and the light alternative. Desktop and 390 px layouts had no horizontal overflow or console warning/error. The 390 px Settings verification alert was caught overlapping during review, fixed to a row-flow grid with a full-width action, and reverified visually. Earlier evidence retains generation handoff, download, variation, favorite, delete, pricing, trust routes, mobile navigation, authentication, failure handling, and 404 coverage. A prior signed-in Kie.ai generation completed the provider, credit, R2, browser-rendering, and authenticated-download path. |
| Google OAuth acceptance | Worker version `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3` completed a real Google authorization-code and PKCE callback, created one identity mapping and browser session, granted starter credits once, entered the private Workspace, consumed the OAuth state, and was subsequently published for external Google accounts |
| Secret-pattern check | No real credential detected in the working-tree scan; placeholders only |
| Cloudflare acceptance environment | Worker custom domains `qwen-image-3.net` and `www.qwen-image-3.net`, D1 database, private R2 bucket, Email Routing, and the 15-minute maintenance/alert trigger are deployed. Forward migrations `0001`–`0013` are applied. Committed revision `b540e47` runs as Worker `e5380627-b98e-45f5-bd77-028baaaa61e5`; health reports `ok`, Kie.ai selected/configured, billing enabled with Stripe credentials/webhook/catalog configured, healthy external alerting, zero failed/stale billing events, and zero open/unrecovered reviews. The public catalog marks all six subscription intervals and all three credit packs available for Checkout. Canonical HTML serves assets `/assets/index-DAuUAkK5.js` and `/assets/index-Cgqznlu8.css`; those immutable assets contain the Studio light/dark controls, revised dark tokens, and the mobile row-flow verification fix. The canonical catalog and prerendered HTML omit the inactive local preview model; the deterministic adapter remains available only when the local or Pages fallback runtime explicitly selects it. Canonical public routes retain the previously verified status, `www` permanently redirects to the apex, and legacy `/prompts` permanently redirects to `/examples`. The Pages fallback remains deployment `623d913e.qwen-image-3.pages.dev` and was not redeployed. Canonical `/terms` and `/refund-policy` expose approved policy version `2026-07-23`. GA4 loads on site entry without a prompt, advertising signals remain disabled, and Google's installation test previously detected the tag successfully. |
| Stripe integration | The replacement Starter/Creator/Professional monthly/yearly and 400/1,200/3,000-credit pack Prices exist in both Live and the isolated Stripe Sandbox; all nine Sandbox Price amounts, currencies, and intervals match D1. Sandbox Worker `2238ec7f-7aed-451f-b204-a1ebb8078d62` at `sandbox.qwen-image-3.net` completed a USD 12/400-credit Checkout; Starter, Creator, and Professional monthly/yearly subscriptions with exact grants; Stripe Portal display and scheduled cancellation; a successful Test Clock renewal; failed renewal, `past_due`, and payment recovery; terminal cancellation; full refund; dispute; actionable Radar early-fraud-warning lifecycle; missing-order reconstruction; and active/trialing/past-due/already-canceled/cancel-at-period-end account deletion. A trial invoice that arrived before account deletion completed on replay after deletion through the billing tombstone. The exercise caught and fixed out-of-order Radar delivery, Stripe's current `cancel_at` Portal payload, already-missing Stripe cleanup, and late financial webhook races. Worker `b5ee6271-4cca-46d8-840f-6f6d8745dc6b` then accepted authenticated risk resolution: unauthorized access failed, Radar and dispute cases cleared, a refund could not be falsely cleared, 400 credits were recovered exactly once, and review health returned to zero. Checkout exposed only synchronous `card` and `link`; its asynchronous-success handler remains signed-event tested but cannot be exercised externally while delayed methods are disabled. The Sandbox Worker restricted key was rotated after acceptance and the exposed Sandbox-only keys were expired. A synthetic failed event changed health to `degraded`, and resolving it restored `ok` with billing event health `0 failed / 0 stale`. Live mode has a dedicated restricted key and 10-event webhook destination. By explicit repository-owner decision, canonical Worker `e5380627-b98e-45f5-bd77-028baaaa61e5` enables new Checkout creation for acceptance operation; this is not production approval. |

Source-control evidence:

- baseline commit `39b9e3a` is pushed to `Tnsea/qwenimage3`;
- Studio action and cleanup commit `532215a`, canonical catalog cleanup commit `efe7104`, and model-table cleanup commit `dd38e44` are pushed on `codex/worker-online-hardening`;
- Studio theme and pricing-handoff commit `551146d` is committed locally on `codex/worker-online-hardening` and deployed to acceptance, but is not yet pushed or covered by a GitHub CI run;
- GitHub Actions run `30062662075` passed the full CI workflow with 99 tests and zero dependency-audit findings for pull request 1.

Limitations of this evidence:

- real Resend, GitHub, and Alibaba Qwen credentials were not exercised; Kie.ai completed one direct Worker task and one signed-in success path, while failure/moderation/timeout/late-completion behavior and provider commercial approval remain open; Google completed one successful acceptance sign-in but its denial/failure paths remain open; Stripe delayed payment methods are disabled, so no real `checkout.session.async_payment_succeeded` event can be generated by the current `card`/`link` Checkout contract;
- Docker/Compose execution was unavailable;
- the deployed Worker is an acceptance revision, not a production approval or a reviewed release marker;
- no formal accessibility, browser-matrix, load, recovery, or external security review exists.
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

### BRAND-001: Unsupported Qwen Image 3 release claim — closed locally

**Evidence:** the release date/link and every Qwen Image 3 availability claim were removed from the product UI. Runtime copy identifies an independent, provider-aware product; the canonical Models page shows configured Qwen 2.0 adapters and the unavailable Qwen Image 3 roadmap entry without exposing the inactive local preview.

**Remaining:** no Qwen Image 3 claim may return without an official source plus implemented provider, license, and acceptance evidence.

### SCM-001: Committed baseline and CI established; reviewed release marker pending

**Evidence:** baseline commit `39b9e3a` is pushed to `main` in `Tnsea/qwenimage3`. Draft pull request 1 tracks the hardening branch. Runtime revision `dd38e44` passed GitHub Actions run `30062662075` with strict checks, 99 tests, Worker checking, the production build, local-artifact scanning, and a zero-finding production dependency audit before deployment. Current acceptance revision `551146d` passed the stricter local release command with 102 tests, artifact scanning, and zero production/full dependency findings before deployment, but remains one local commit ahead of the pushed branch and has no corresponding GitHub CI run.

**Remaining:** review and merge the pull request, then deploy from the reviewed immutable revision instead of treating a pre-review acceptance deployment as a release.

**Acceptance:** successful required CI on the reviewed hardening revision and recorded deployment provenance.

### AUTH-001: Google success path verified; remaining external identity and email flows are unverified

**Evidence:** current health reports Google configured while GitHub and external email remain disabled. Adapter tests exercise Google's authorization URL, PKCE token exchange, verified-profile mapping, exact callback, Cloudflare-compatible redirect handling, and browser-bound state. A real Google account completed the callback on Worker `48f7704c-0cc7-4f25-9ae6-9efda9d0deb3`; D1 recorded one identity mapping and an active browser session, the private Workspace loaded with the one-time starter grant, and no OAuth state remained. Google Auth Platform now reports publishing status `Production` for the external user type, so accounts outside the tester list may authorize.

**Impact:** Google denial/failure behavior, GitHub callback behavior, sender reputation, delivery, and recovery remain unknown. The customer UI is Google-only, while its Settings password and account-deletion recovery copy still depend on retained password/email capabilities that are not available through the canonical sign-in UI; that account-control path needs a reviewed Google reauthentication or credential-bootstrap decision before external beta.

**Acceptance:** complete Google denial/failure paths against the canonical HTTPS origin without exposing tokens, decide and verify the Google-only password/account-deletion path, and complete Resend/GitHub acceptance before either retained capability is exposed.

### MODEL-001: Kie.ai Qwen Image 2 signed-in success path is externally verified; failure/timeout gates pending

**Evidence:** the Worker implements the documented `qwen2/text-to-image` task contract, bounded polling, immediate private R2 ingestion, exact API/result-host enforcement, redirect revalidation, image MIME/signature/size checks, and safe error mapping. The fixed 2K model is exposed only as a four-credit Standard generation with documented ratios and an 800-character prompt limit; both the client and server reject unsupported settings before provider spend. Catalog availability is fail-closed unless the exact model and complete Kie configuration are selected. Mocked integration tests cover one successful task, an unapproved result host, provider failure, unsupported settings, and receiver-safe `fetch` invocation. A dedicated Kie key restricted to Qwen Image 2.0 was created on July 24, 2026, stored as a managed Worker secret, and capped at 200 hourly, 1,000 daily, and 4,000 lifetime Kie credits. A no-spend Worker probe authenticated successfully. The first generation probe exposed and led to a fix for Cloudflare's receiver-sensitive global `fetch`. The fixed Worker then completed paid task `1c72e61aba62832596065a6d4b0aeb48`, polled it to `success`, accepted `tempfile.aiquickdraw.com`, and downloaded a validated 5,402,317-byte PNG. Kie balance moved from 5,060.27 to 5,054.67 credits, matching the 5.6-credit task charge. The diagnostic routes were removed by restoring immutable Worker `d141caeb-4703-45a6-bb1d-53981c829fe8`. On preceding Worker `d36d2ba1-c241-4a14-9ec1-dfa0da9e8fa3`, signed-in generation `9cc97bfb-5dfd-4d46-9815-d08ccec64510` completed at `2026-07-24T01:06:59.761Z`. D1 recorded a four-credit reservation and settlement, moved the account from 20 to 16 available credits with zero reserved, and stored a `complete` Kie.ai/Qwen Image 2 record. Private R2 contained the referenced 5,042,697-byte, 2048×2048 PNG; the browser rendered it and exposed Save, Variation, and authenticated Download controls. An unauthenticated download returned HTTP 401.

**Impact:** provider-side access, current task price, provider balance deduction, polling, result host, PNG download, signed-in D1 reservation/settlement, private R2 persistence, browser rendering, output dimensions, and private-download enforcement are observed. Moderation/failure behavior, timeout recovery, late task completion, data/commercial terms, and production load remain unaccepted. The synchronous request may time out after Kie.ai has accepted a billable task, so public use could create untracked cost or refund product credits while provider spend continues.

**Acceptance:** test provider failure, moderation, timeout, late-completion, and product-credit refund behavior; approve the provider contract; and record the production risk decision. Durable callback/queue handling or an explicitly accepted synchronous risk limit is required before production approval.

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
| `OPS-001` | Cloudflare invocation logs and aggregate billing-health email alerts are active; broader metrics, tracing, financial reconciliation, and on-call supervision are absent | Production observability and on-call actions |
| `OPS-002` | The current Cloudflare custom-domain acceptance revision and Worker are recorded in the deployment section below; a pre-migration D1 export, forward migrations, alert evidence, GA4 installation evidence, and rollback Worker identifiers are retained. Restore/rollback execution remains unverified | CI evidence, health supervision, backup/restore, and rollback drill |
| `UI-001` | Studio history exposes authenticated download, favorite, variation, failed-generation retry, and confirmed permanent removal actions; failed records retain the explicit no-charge state | Accessibility acceptance for failure announcements, confirmation, and focus |
| `WEB-001` | Client/API routing, account-gated generation, direct Studio-history handoff, signed-in pricing, Checkout gate behavior, legacy Prompts redirect, and one historical signed-in provider result have acceptance evidence | Complete the browser matrix, error routes, Studio action smoke, and rollback acceptance |

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

- Source revision and CI: committed revision `b540e47cea24128697a3f9845297d4e2cde14a77`; immutable local `verify:release` passed before commit and again inside deployment with 102 tests, production artifact scanning, and zero production/full dependency findings. This local commit has not been pushed and has no new GitHub CI run; historical run `30062662075` applies only to earlier revision `dd38e44`
- Worker version: `e5380627-b98e-45f5-bd77-028baaaa61e5`
- Environment and URLs: Cloudflare acceptance at `https://qwen-image-3.net`; Pages fallback at `https://qwen-image-3.pages.dev`, immutable Pages deployment `https://623d913e.qwen-image-3.pages.dev`
- Enabled providers: Kie.ai Qwen Image 2 with one externally successful Worker task, Google OAuth published for external Google accounts, Cloudflare Email Routing billing alerts, and Live Stripe Checkout for all nine configured offers by explicit repository-owner decision; deterministic local preview remains a local and Pages fallback selected only by those runtimes and is absent from the canonical catalog, while Alibaba Qwen, GitHub, and transactional account email remain disabled
- Applied migrations: `0001`–`0013`; pre-change D1 export retained at ignored path `backups/qwen-image-3-20260723-155637.sql`
- Rollback identifiers: immediate predecessor `a84277dd-c81d-4944-a4da-418aaec1f959` is the billing-disabled rollback for shutting off new Checkout. Earlier billing-disabled Worker `e9315acd-5b98-462d-b4ed-dcc7bc0845d8` remains in deployment history. D1 restore has not been exercised
- Live smoke: July 24, 2026, 11:47 Asia/Shanghai; canonical health reported `ok`, Worker `e5380627-b98e-45f5-bd77-028baaaa61e5`, D1/R2, fresh maintenance, Kie.ai selected/configured, billing enabled, configured Stripe credentials/webhook/catalog, zero failed/stale events, zero open/unrecovered reviews, and healthy alerting. The public catalog marked all six subscription intervals and three credit packs configured for Checkout. `/pricing` returned HTTP 200 with the expected security headers; `www` returned a permanent 308 to the apex. Canonical HTML continued to load `/assets/index-DAuUAkK5.js` and `/assets/index-Cgqznlu8.css`, whose Studio theme and mobile-layout acceptance remains current. No canonical signed-in Checkout, payment, or new provider request was used for this configuration deployment, so the prior Sandbox lifecycle and signed-in generation evidence remains authoritative. The Pages fallback was not redeployed.
- Operator: repository owner with Codex implementation assistance
- Deferred blockers: all P0/P1 and applicable P2 items above remain blocking

The Worker and client runtime content are represented by committed revision `b540e47cea24128697a3f9845297d4e2cde14a77` and were deployed only after immutable local release verification. A matching GitHub CI run and reviewed release marker remain pending. This record documents acceptance evidence and the explicit Checkout operating decision only—not a Ready or production-approval decision.
