# Billing Terms Copy Approval

Status: **PRODUCT-OWNER APPROVED; CANONICAL COPY DEPLOYED**

Policy version: `2026-07-23`

Proposed effective date: July 23, 2026

Authoritative user-visible source: [`src/billing-policy.ts`](../src/billing-policy.ts)
Approved source SHA-256: `212c2d85377211f74cb617f190fda96500ad0f24e18d111a16b7902abc307bbf`

This record covers product-copy approval, not legal advice or a launch-region legal review. The exact English copy is approved and deployed; canonical public billing remains disabled until the remaining release gates pass.

## Surfaces under review

- `/pricing` shows the automatic-renewal, cancellation, yearly-credit, refund-review, and payment-risk summary before selection. Its offer buttons state that selection confirms the current policies, record that acceptance, and open Stripe Checkout directly; a pre-sign-in selection resumes after Google OAuth.
- `/terms` shows the complete Billing Terms.
- `/refund-policy` shows the complete Refund Policy.
- `/studio/billing` retains an explicit checkbox for purchases initiated inside Studio.
- `POST /api/billing/terms/accept` records the account, policy version, time, coarse IP hint, and user agent.
- `POST /api/billing/checkout` rejects a missing or obsolete acceptance and stores the accepted version/time on the Checkout attempt and Stripe metadata.

## Material statements requiring approval

1. Monthly and yearly subscriptions renew automatically at the selected interval until canceled in the Stripe customer portal.
2. Cancellation must occur before renewal to stop the next charge and takes effect at the end of the current paid period.
3. Monthly subscription credits are granted after each paid monthly invoice; yearly credits are granted as one full annual allowance, not monthly installments.
4. Credit packs are one-time, nonrenewing purchases and remain available until used while the account remains open.
5. Cancellation does not automatically refund the current period.
6. Duplicate, unauthorized, or verified billing-error requests should reach Support within seven days; discretionary refunds require the related paid credits to be unused, subject to non-waivable local rights.
7. Credits spent on completed generations are normally nonrefundable. Failed generations restore reserved credits automatically.
8. A refund, dispute, or actionable Stripe fraud warning may pause purchasing and generation while reviewed. Confirmed losses remove no more than the related available credits, never create a negative balance, and may keep spending paused when exposure remains.
9. Stripe shows the charge, interval, and applicable tax before payment. A return from Checkout alone is not proof of settlement.
10. Account deletion removes local data only after Stripe subscription/customer cleanup succeeds.

## Approval record

- Product owner: **Project owner (approval recorded in the Codex task)**
- Decision: **approved without requested copy changes**
- Approved policy version: **2026-07-23**
- Approved at: **2026-07-23T15:53:01Z**
- Requested changes: **none recorded**
- External alert delivery evidence: **accepted on Worker `7bfce1bd-6785-4e60-a30e-610ea5346ba1`; D1 recorded delivered test `alert-acceptance-20260723-b95303e` at `2026-07-23T15:57:38.199Z`, and Cloudflare Activity Log reported Delivered**
- Canonical copy acceptance: **`/terms` and `/refund-policy` returned the approved version on the deployed origin**

Any later material copy change must increment `BILLING_TERMS_VERSION` so existing customers are asked to accept the new version.
