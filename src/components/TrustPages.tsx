import {
  ArrowRight,
  BadgeDollarSign,
  Cloud,
  Code2,
  CreditCard,
  Database,
  EyeOff,
  Fingerprint,
  Image as ImageIcon,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  Server,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TrustPageProps {
  onNavigate: (path: string) => void;
}

interface TrustSection {
  title: string;
  icon: LucideIcon;
  paragraphs: readonly string[];
}

function TrustPageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="content-page-intro trust-page-intro">
      <div className="section-kicker">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{copy}</p>
    </header>
  );
}

function TrustSectionGrid({ sections }: { sections: readonly TrustSection[] }) {
  return (
    <div className="trust-section-grid">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <section className="card card-border trust-section-card" key={section.title}>
            <div className="card-body">
              <span className="trust-card-icon" aria-hidden="true"><Icon size={18} /></span>
              <h2 className="card-title">{section.title}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const privacySections: readonly TrustSection[] = [
  {
    title: "Account and access data",
    icon: UserRoundCheck,
    paragraphs: [
      "We process the name and email attached to your account, verification state, connected sign-in identities, and the device and session information needed to authenticate you and protect access.",
      "Passwords are stored as password hashes. Session, security, OAuth-state, and API-key secrets are stored as hashes where the product contract requires them; full API keys are shown only when first created.",
    ],
  },
  {
    title: "Prompts, settings, and images",
    icon: ImageIcon,
    paragraphs: [
      "A generation request contains your prompt, selected model, aspect ratio, style, quality, and optional project. The service stores generation metadata and private result assets so you can use history, projects, favorites, variations, and downloads.",
      "Generations are private by default. The product does not place them in a public gallery or publish them automatically.",
    ],
  },
  {
    title: "Billing and support records",
    icon: CreditCard,
    paragraphs: [
      "Stripe handles payment collection. The service stores the customer, subscription, order, payment, refund, dispute, and credit-ledger references required to fulfill purchases and reconcile billing, but it does not ask you to send full card details through the product.",
      "Private support tickets retain the subject, category, priority, messages, and related account context needed to investigate your request.",
    ],
  },
  {
    title: "Analytics and security events",
    icon: Fingerprint,
    paragraphs: [
      "Google Analytics 4 measures page visits when the site loads. Advertising storage, advertising user data, personalization, Google Signals, and ad-personalization signals are disabled. Prompts, generated images, account identifiers, emails, billing identifiers, and project names are not added to analytics events.",
      "Operational logs and request records may include timestamps, coarse network hints, request IDs, status, latency, and security or billing-review events needed to detect abuse, debug failures, and protect account balances.",
    ],
  },
];

export function PrivacyDataPage({ onNavigate }: TrustPageProps) {
  return (
    <main className="content-page trust-page">
      <TrustPageIntro
        eyebrow="Privacy and data notice"
        title="Your data, without vague promises."
        copy="This page explains what the pre-release service processes, why it is needed, which service providers may receive it, and which controls are available to you. Launch-region privacy, residency, age-limit, and legal-basis review is still pending; this notice does not claim production legal approval."
      />

      <TrustSectionGrid sections={privacySections} />

      <section className="trust-detail-section" aria-labelledby="privacy-providers-title">
        <div className="trust-detail-heading">
          <span className="trust-card-icon" aria-hidden="true"><Cloud size={18} /></span>
          <div>
            <span>Service boundaries</span>
            <h2 id="privacy-providers-title">When data leaves the application boundary.</h2>
          </div>
        </div>
        <div className="trust-detail-grid">
          <article>
            <h3>Cloudflare</h3>
            <p>The acceptance runtime uses a Cloudflare Worker, D1 for relational records, and private R2 objects for generated assets.</p>
          </article>
          <article>
            <h3>Image providers</h3>
            <p>The selected model and provider are shown before generation. If an external provider is configured and selected, the prompt and generation settings required for that request are sent to that provider. No verified Qwen Image 3 provider is connected today.</p>
          </article>
          <article>
            <h3>Stripe and sign-in providers</h3>
            <p>Stripe processes paid Checkout and billing management. Google or GitHub receives the standard OAuth request only when you choose that sign-in method; provider availability is shown in the interface.</p>
          </article>
          <article>
            <h3>Google Analytics</h3>
            <p>GA4 receives reviewed page-view data. Product code is designed not to add prompts, generated assets, user IDs, email addresses, billing identifiers, or project names to those events.</p>
          </article>
        </div>
      </section>

      <section className="card card-border trust-wide-card" aria-labelledby="privacy-controls-title">
        <div className="card-body">
          <div className="trust-wide-card-heading">
            <span className="trust-card-icon" aria-hidden="true"><Database size={18} /></span>
            <div>
              <span>Your controls</span>
              <h2 id="privacy-controls-title" className="card-title">Export, review, and delete account data.</h2>
            </div>
          </div>
          <p>
            Studio provides account-data export, session review, API-key revocation, project controls, and account deletion.
            Account deletion first attempts to cancel the Stripe subscription and remove the Stripe customer; local identity,
            assets, projects, credits, sessions, keys, and connected identities are deleted only after that external cleanup succeeds.
          </p>
          <p>
            No universal public retention period is claimed yet. Scheduled maintenance removes expired operational state and
            continues draining legacy guest assets, while backup deletion, restore evidence, and production retention telemetry
            remain unverified.
          </p>
          <div className="card-actions">
            <button className="btn" type="button" onClick={() => onNavigate("/studio/settings")}>Open data controls <ArrowRight size={14} /></button>
            <button className="btn btn-ghost" type="button" onClick={() => onNavigate("/support")}>Ask a data question</button>
          </div>
        </div>
      </section>
    </main>
  );
}

const statusCards = [
  {
    title: "Product environment",
    badge: "Pre-release",
    badgeClass: "badge-warning badge-soft",
    icon: Server,
    copy: "The Cloudflare custom-domain acceptance environment is deployed and smoke-tested. It is not an externally accepted production service.",
  },
  {
    title: "Canonical image runtime",
    badge: "Kie.ai selected",
    badgeClass: "badge-warning badge-soft",
    icon: ImageIcon,
    copy: "The canonical acceptance Worker selects Kie.ai Qwen Image 2. One signed-in request completed successfully, while failure, timeout, moderation, commercial approval, and production approval remain pending.",
  },
  {
    title: "Qwen Image 3",
    badge: "Official; not connected",
    badgeClass: "badge-warning badge-soft",
    icon: Code2,
    copy: "Qwen officially announced Qwen-Image-3.0 on July 21, 2026, and Alibaba Cloud documents an invite-only qwen-image-3.0-pro API. This site has not implemented, selected, or externally accepted an Image 3 adapter.",
  },
  {
    title: "Public billing",
    badge: "Fail-closed",
    badgeClass: "badge-info badge-soft",
    icon: BadgeDollarSign,
    copy: "New Checkout creation stays disabled unless the billing gate, environment-specific Stripe Price, and active catalog version all match. Sandbox lifecycle evidence is not public production approval.",
  },
] as const;

export function IndependentStatusPage({ onNavigate }: TrustPageProps) {
  return (
    <main className="content-page trust-page status-page">
      <TrustPageIntro
        eyebrow="Independent product status"
        title="What works, what is verified, and what is not."
        copy="Qwen Image 3 Generator Hub is an independent third-party product. It is not affiliated with, endorsed by, or presented as an official service of Alibaba or the Qwen team."
      />

      <div className="status-card-grid" aria-label="Current product status">
        {statusCards.map((item) => {
          const Icon = item.icon;
          return (
            <article className="card card-border status-card" key={item.title}>
              <div className="card-body">
                <div className="status-card-top">
                  <span className="trust-card-icon" aria-hidden="true"><Icon size={18} /></span>
                  <span className={`badge ${item.badgeClass}`}>{item.badge}</span>
                </div>
                <h2 className="card-title">{item.title}</h2>
                <p>{item.copy}</p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="trust-detail-section" aria-labelledby="verification-boundary-title">
        <div className="trust-detail-heading">
          <span className="trust-card-icon" aria-hidden="true"><ShieldCheck size={18} /></span>
          <div>
            <span>Verification boundary</span>
            <h2 id="verification-boundary-title">A build, a deployment, and a live acceptance check are different things.</h2>
          </div>
        </div>
        <div className="trust-detail-grid status-detail-grid">
          <article>
            <h3>Verified locally</h3>
            <p>Account gating, private ownership, quotas, billing settlement, credits, API access, and major failure paths have automated local coverage.</p>
          </article>
          <article>
            <h3>Accepted in isolated services</h3>
            <p>Stripe Sandbox lifecycle cases and one real Google sign-in have evidence. That does not approve public billing, every OAuth failure path, or the complete product.</p>
          </article>
          <article>
            <h3>Still unverified</h3>
            <p>Kie.ai failure, moderation, timeout, and late-completion behavior; provider commercial terms; Alibaba Qwen execution; production backup and restore; broad browser and accessibility acceptance; production telemetry; and launch-region privacy and legal review remain open. One signed-in Kie.ai Qwen Image 2 request completed credit settlement, private R2 persistence, and browser rendering in the acceptance environment.</p>
          </article>
          <article>
            <h3>Current source of truth</h3>
            <p>The model selector and Models page identify available runtimes. Pricing disables Checkout when required billing configuration is absent.</p>
          </article>
        </div>
      </section>

      <div className="trust-page-actions">
        <button className="btn" type="button" onClick={() => onNavigate("/models")}>Review model status <ArrowRight size={14} /></button>
        <button className="btn btn-outline" type="button" onClick={() => onNavigate("/pricing")}>Review pricing gates</button>
        <button className="btn btn-ghost" type="button" onClick={() => onNavigate("/support")}>Report a discrepancy</button>
      </div>
    </main>
  );
}

const supportPaths = [
  {
    title: "Generation help",
    icon: ImageIcon,
    copy: "Include the generation or request ID, selected model, expected result, and what happened. Do not paste private API keys.",
  },
  {
    title: "Billing help",
    icon: CreditCard,
    copy: "Include the order identifier shown in Studio > Payments. Never send a full card number, password, or Stripe secret.",
  },
  {
    title: "Account and API help",
    icon: KeyRound,
    copy: "Use a private ticket for sign-in, export, deletion, sessions, API keys, or request-log questions tied to your account.",
  },
] as const;

export function SupportPage({ onNavigate }: TrustPageProps) {
  return (
    <main className="content-page trust-page support-page">
      <TrustPageIntro
        eyebrow="Support"
        title="Get help through a private account ticket."
        copy="Support conversations live inside Studio so requests, replies, and relevant account context stay attached to the signed-in account instead of a public form."
      />

      <div className="support-path-grid">
        {supportPaths.map((item) => {
          const Icon = item.icon;
          return (
            <article className="card card-border support-path-card" key={item.title}>
              <div className="card-body">
                <span className="trust-card-icon" aria-hidden="true"><Icon size={18} /></span>
                <h2 className="card-title">{item.title}</h2>
                <p>{item.copy}</p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="support-primary card card-border">
        <div className="card-body">
          <div className="support-primary-icon" aria-hidden="true"><LifeBuoy size={25} /></div>
          <div>
            <span>Private support workspace</span>
            <h2 className="card-title">Open, follow, and reply to a ticket in Studio.</h2>
            <p>Sign-in is required. If you are not signed in, the next screen will ask you to authenticate before showing account support.</p>
          </div>
          <div className="card-actions">
            <button className="btn" type="button" onClick={() => onNavigate("/studio/support")}>Open private support <ArrowRight size={14} /></button>
          </div>
        </div>
      </section>

      <div role="alert" className="alert alert-info alert-soft trust-page-alert">
        <LockKeyhole size={18} />
        <div>
          <strong>Keep secrets out of tickets</strong>
          <span>Do not submit passwords, complete API keys, raw session tokens, provider credentials, or full payment-card details. Support has no reason to request them.</span>
        </div>
      </div>

      <section className="trust-support-notes" aria-labelledby="support-expectations-title">
        <div>
          <EyeOff size={18} aria-hidden="true" />
          <h2 id="support-expectations-title">What to expect</h2>
        </div>
        <p>
          Tickets can be opened with normal or high priority, followed in a private conversation, closed, and reopened.
          No public response-time guarantee or production support SLA is claimed for this pre-release environment.
        </p>
      </section>
    </main>
  );
}
