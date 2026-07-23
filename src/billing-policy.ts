export const BILLING_TERMS_VERSION = "2026-07-23";
export const BILLING_TERMS_EFFECTIVE_DATE = "July 23, 2026";

export const billingPolicySummary = [
  "Subscriptions renew automatically at the selected monthly or yearly interval until canceled in the Stripe customer portal.",
  "Cancel before the renewal date to stop the next charge. Cancellation takes effect at the end of the paid billing period.",
  "Yearly plans grant the full annual credit allowance after payment. Credit packs are one-time purchases and do not renew.",
  "Refund requests are reviewed under the Refund Policy. Refunded or disputed purchases may have their related credits removed and account spending paused while the payment is reviewed.",
] as const;

export const termsSections = [
  {
    title: "Subscriptions and renewal",
    paragraphs: [
      "Subscription prices are charged in U.S. dollars through Stripe. Monthly and yearly subscriptions renew automatically at the same interval until you cancel them in the Stripe customer portal.",
      "Cancel before the renewal date shown in Studio or Stripe to avoid the next charge. Cancellation takes effect at the end of the current paid billing period; access and remaining credits continue through that period unless a payment review requires a temporary pause.",
      "Monthly subscription credits are granted after each successful monthly invoice. Yearly subscription credits are granted as one annual allowance after the yearly invoice is paid. A yearly plan does not replenish credits each month.",
    ],
  },
  {
    title: "Credits and generation failures",
    paragraphs: [
      "Standard, High, and Ultra generations cost 4, 8, and 16 credits. Credits are account-bound, have no cash value, and cannot be transferred.",
      "One-time credit packs do not renew and remain available until used while the account remains open. A generation that fails before settlement automatically releases or restores the credits reserved for that request; this is a credit correction, not a cash refund.",
    ],
  },
  {
    title: "Charges, taxes, and payment processing",
    paragraphs: [
      "The amount, billing interval, and any applicable tax charged by Stripe are shown before you confirm payment. Your card issuer or payment provider may separately apply currency-conversion or other fees that we do not control.",
      "Credits and subscription access are issued only after a signed Stripe event confirms payment. A return from Checkout by itself does not prove that payment completed.",
    ],
  },
  {
    title: "Refunds, disputes, and payment risk",
    paragraphs: [
      "Cancellation stops future renewals and does not automatically refund the current billing period. Refund eligibility is governed by the Refund Policy and any non-waivable rights that apply where you live.",
      "When Stripe reports a refund, dispute, or actionable fraud warning, purchases and credit spending may be paused while the payment is reviewed. Related credits may be removed after a confirmed refund or loss. Credit balances never become negative; if the available balance is lower than the confirmed exposure, spending remains paused until the review is resolved.",
    ],
  },
  {
    title: "Support and account deletion",
    paragraphs: [
      "Use the private Support area in Studio for billing questions or refund requests. Include the order shown in your payment history, but never send a full card number or account password.",
      "Deleting an account first attempts to cancel its Stripe subscription and delete its Stripe customer record. Local account data is deleted only after that external billing cleanup succeeds.",
    ],
  },
] as const;

export const refundPolicySections = [
  {
    title: "When to request a refund",
    paragraphs: [
      "Contact Support within 7 days of the initial purchase or renewal if you believe you were charged twice, did not authorize the charge, or could not receive the purchased credits or subscription access because of our verified billing error.",
      "For a discretionary refund request, paid credits from that purchase must be unused. We may ask for the order identifier shown in Studio and evidence needed to locate the Stripe payment. This policy does not limit any non-waivable consumer rights that apply where you live.",
    ],
  },
  {
    title: "Subscriptions",
    paragraphs: [
      "Cancel in the Stripe customer portal before the next renewal date to stop future charges. Cancellation takes effect at the end of the paid period and does not automatically create a refund for that period.",
      "A yearly subscription grants the full annual credit allowance after payment. It is not a month-to-month installment plan, and unused annual capacity does not create an automatic prorated refund.",
    ],
  },
  {
    title: "Credit packs and used credits",
    paragraphs: [
      "Credit packs are one-time, nonrenewing purchases. Requests involving unused paid credits may be reviewed under this policy. Credits already spent on completed generations are not normally refundable unless required by law or the completed generation was affected by a verified service failure that was not already corrected in credits.",
      "Failed generations automatically restore their reserved credits. Because no generation charge remains after that correction, a separate cash refund is not normally due for the failed request.",
    ],
  },
  {
    title: "After a refund, dispute, or fraud warning",
    paragraphs: [
      "A completed refund or confirmed payment loss removes no more than the related credits that remain available. If the available balance is insufficient, spending may stay paused while Support completes the review; the credit balance will not become negative.",
      "A card dispute or actionable Stripe fraud warning may temporarily pause Checkout and generation. A cleared false positive or resolved dispute restores access only when no other payment review or unrecovered loss remains.",
    ],
  },
  {
    title: "How to contact us",
    paragraphs: [
      "Open a private billing ticket from Studio > Support. Choose the billing category and include the order identifier visible in Studio > Payments. Do not include a full payment-card number, password, or API key.",
    ],
  },
] as const;
