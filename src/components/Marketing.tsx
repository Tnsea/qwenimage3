import { ArrowRight, ArrowUpRight, BookOpen, Check, Code2, Coins, Copy, Crown, Gauge, Image as ImageIcon, KeyRound, Layers3, ShieldCheck, WandSparkles, Zap } from "lucide-react";
import { useState } from "react";
import {
  BILLING_TERMS_EFFECTIVE_DATE,
  BILLING_TERMS_VERSION,
  billingPolicySummary,
  refundPolicySections,
  termsSections,
} from "../billing-policy";
import { exampleMedia } from "../exampleMedia";
import { promptMedia } from "../promptMedia";
import type { Catalog } from "../types";

export type { Catalog } from "../types";

interface NavigateProps {
  onNavigate: (path: string) => void;
  onUsePrompt?: (prompt: string) => void;
  onRegister?: () => void;
}

export function HomeSections({ catalog, onNavigate, onUsePrompt, onRegister }: { catalog: Catalog } & NavigateProps) {
  const faqs = [
    ["account-access", "Can I generate without signing in?", "No. Image generation requires an account so every request is charged against a server-authoritative credit balance."],
    ["starter-credits", "Do new accounts receive starter credits?", "Yes. A new account receives 20 welcome credits once—enough for five Standard images. Generation requires signing in."],
    ["credits", "How do credits work?", "Standard costs 4 credits, High costs 8, and Ultra costs 16. Credits are reserved first and settled only after a successful result."],
    ["failed-generations", "Are failed generations charged?", "No. A system or provider failure releases the reservation automatically and restores the account credits."],
    ["priority", "Do paid generations run faster?", "Creator and Professional subscribers enter the VIP priority lane. Starter subscribers use the standard account queue while keeping private, watermark-free exports."],
    ["privacy", "Are my images public?", "No. Generations are private by default. Nothing is published without a separate explicit action."],
    ["analytics", "Do you use analytics?", "Yes. GA4 measures page visits when the site loads. Advertising storage and personalization are disabled, and prompts, generated images, and account identifiers are not sent."],
    ["model-availability", "Is Qwen Image 3 available in this generator?", "No verified Qwen Image 3 provider is currently connected. You can still create with the available runtime shown in the generator, and the Models page identifies the exact system used for every image."],
    ["billing-refunds", "What happens after a refund or dispute?", "Credit spending is paused for billing review, the financial event is shown in billing history, and no silent balance mutation is performed."],
    ["account-deletion", "What does account deletion remove?", "Any Stripe subscription and customer are removed first, then local assets, projects, credits, sessions, keys, and connected identities are deleted."],
    ["api-audit", "Can I audit API use?", "Yes. Scoped API keys and recent request status, latency, and request IDs are available inside Studio."],
    ["independent-product", "Is this an official Qwen product?", "No. This is an independent third-party product and is not affiliated with or endorsed by Alibaba or the Qwen team."],
  ];
  const starterPlan = catalog.plans.find((plan) => plan.id === "starter");
  const creatorPlan = catalog.plans.find((plan) => plan.id === "creator");
  const creatorAvailable = Boolean(creatorPlan?.monthlyConfigured || creatorPlan?.yearlyConfigured);

  return (
    <>
      <section className="marketing-section how-section" id="how-it-works">
        <div className="section-kicker">Account-based creation</div><h2>Generate an image in three steps.</h2>
        <div className="steps-grid">
          <article className="card card-border process-card"><span>01</span><WandSparkles /><h3>Sign in and describe</h3><p>Create an account for 20 welcome credits, then write the subject, setting, mood, and lighting you want.</p></article>
          <article className="card card-border process-card"><span>02</span><Layers3 /><h3>Choose runtime and format</h3><p>Select an available preview or provider model, aspect ratio, visual style, and quality level.</p></article>
          <article className="card card-border process-card"><span>03</span><ImageIcon /><h3>Generate and download</h3><p>Create a private image, make variations, save favorites, or download the finished result.</p></article>
        </div>
      </section>

      <section className="marketing-section seo-guide-section" id="qwen-image-3-guide">
        <div className="seo-guide-intro">
          <div>
            <div className="section-kicker">Built for image creation</div>
            <h2>Create private image results in one workspace.</h2>
          </div>
          <p>
            Qwen Image 3 Generator Hub brings the image generation workflow into one place: describe what you want to see,
            select an available preview or provider model, choose the aspect ratio and visual finish, then generate a private
            result. Create product visuals, campaign concepts, social graphics, cinematic scenes, editorial
            images, illustrations, and rapid creative studies. Model availability stays visible before every
            request, so you always know which provider will create your image.
          </p>
        </div>

        <figure className="workflow-figure">
          {/* "Qwen Image 3" is the product name, not a redundant description of the img element. */}
          {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
          <img
            src="/qwen-image-3-workflow.png"
            width="1200"
            height="630"
            loading="lazy"
            decoding="async"
            alt="Qwen Image 3 Generator Hub workspace with model, format, and private export controls"
          />
          <figcaption>Describe an image, choose the available model and format, then generate and refine privately.</figcaption>
        </figure>

        <div className="seo-copy-grid">
          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Generate images from everyday language</h3>
              <p>
                Start with a plain-English description of the image you need. The generator turns the subject,
                setting, composition, lighting, and mood into one generation request, whether you are creating
                a product hero, editorial illustration, architectural concept, social graphic, or cinematic
                frame. Browse the <a className="link" href="/examples">image example gallery</a>, begin with one
                sentence, and add detail only when the result needs tighter control.
              </p>
            </div>
          </article>

          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Control the format and finish</h3>
              <p>
                Choose square, landscape, portrait, or widescreen dimensions before generation. Then select a
                visual style—Photorealistic, Editorial, Cinematic, or Illustration—and match the quality level
                to the job. Standard is efficient for exploration, High balances speed and detail, and Ultra
                produces the largest result when final-image detail matters most.
              </p>
            </div>
          </article>

          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Choose an available image runtime</h3>
              <p>
                The model selector lists the systems this workspace can actually use. Available runtimes can
                be selected directly; models that still need provider configuration remain visible but disabled.
                The <a className="link" href="/models">model catalog</a> explains provider, speed, cost, and intended
                use before you spend account credits.
              </p>
            </div>
          </article>

          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Refine, organize, and download results</h3>
              <p>
                Every generated image can become the starting point for a variation. Signed-in creators can save
                favorites, group work into projects, and return through private history. Starter-account downloads
                include a watermark; verified Creator entitlement unlocks original exports and the priority
                generation queue. Failed requests automatically restore reserved credits.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="marketing-section workflow-notes" aria-labelledby="workflow-notes-title">
        <div className="section-kicker">Product capabilities</div>
        <h2 id="workflow-notes-title">Image generation built for private, repeatable work.</h2>
        <div className="workflow-notes-grid">
          <article>
            <h3>Choose the model that creates your image</h3>
            <p>
              Select the image model directly inside the generator. The backend accepts only models marked
              available by the current provider configuration, records the chosen model with the result, and
              rejects unavailable model IDs. The <a className="link" href="/models">model comparison</a> keeps
              roadmap entries separate from systems that can generate an image now.
            </p>
          </article>
          <article>
            <h3>See image cost and queue status</h3>
            <p>
              Generation requires an account, and every request shows the exact quality cost before it starts:
              Standard uses four credits, High uses eight, and Ultra uses sixteen.
              The <a className="link" href="/pricing">pricing page</a> explains watermark-free exports and Creator
              priority without hiding the image allowance behind vague token totals.
            </p>
          </article>
          <article>
            <h3>Keep and export generated images</h3>
            <p>
              Generated images are private by default and never placed in a public gallery automatically. Account
              generations remain available through projects, history, and favorites according to the active
              retention policy. Read the <a className="link" href="/guides">image generation guides</a> for export,
              quality, and account workflows.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-section examples-preview" id="examples">
        <div className="section-heading-row">
          <div>
            <div className="section-kicker">Visual prompt references</div>
            <h2>See the image direction before you start.</h2>
            <p className="examples-section-note">Each reference pairs a clear visual target with a ready-to-use prompt.</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => onNavigate("/examples")}>View all references <ArrowRight size={16} /></button>
        </div>
        <div className="prompt-preview-grid">
          {catalog.prompts.slice(0, 4).map((item) => {
            const media = exampleMedia[item.id];
            return (
              <article className="card prompt-preview-card" key={item.id}>
                {media && (
                  <figure className="prompt-preview-media">
                    <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading="lazy" decoding="async" />
                    <figcaption>{item.category}</figcaption>
                  </figure>
                )}
                <div className="card-body">
                  <h3 className="card-title">{item.title}</h3>
                  <p>{item.prompt}</p>
                  <div className="card-actions">
                    <button className="btn btn-sm" type="button" onClick={() => onUsePrompt?.(item.prompt)}>Use this prompt <ArrowRight size={14} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="marketing-section model-preview">
        <div className="model-preview-copy"><div className="section-kicker">Model choice</div><h2>Choose the model for each image.</h2><p>Available models can be selected inside the generator. Provider requirements and roadmap models remain clearly labeled.</p><button className="btn btn-primary" type="button" onClick={() => onNavigate("/models")}>View model options <ArrowRight size={16} /></button></div>
        <div className="model-signal-card card card-border">{catalog.models.map((model) => <div className="signal-line" key={model.id}><span className={`status ${model.status === "Available" ? "status-success" : "status-warning"}`} />{model.name}<strong>{model.status}</strong></div>)}<div className="signal-metrics"><span><Gauge />Status from server configuration</span><span><ShieldCheck />Private by default</span><span><Code2 />Stable provider boundary</span></div></div>
      </section>

      <section className="marketing-section pricing-preview" id="pricing">
        <div className="pricing-preview-header">
          <div>
            <div className="section-kicker">Account-based pricing</div>
            <h2>Start small, then scale with clear image capacity.</h2>
            <p>Every account receives 20 welcome credits. Paid plans begin at 500 credits per month.</p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => onNavigate("/pricing")}>See full pricing <ArrowRight size={15} /></button>
        </div>
        <div className="plan-decision-grid">
          <article className="card plan-decision plan-decision-primary">
            <div className="card-body">
              <div className="plan-decision-top">
                <span className="plan-eyebrow">Entry subscription</span>
                <span className="plan-price">{starterPlan?.price ?? "$9.90 / month"}</span>
              </div>
              <h3>{starterPlan?.name ?? "Starter"}</h3>
              <p>{starterPlan?.description ?? "A practical entry plan for an account-based image workflow."}</p>
              <ul className="plan-feature-list">{(starterPlan?.features ?? []).slice(0, 4).map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
              <div className="plan-actions">
                <button className="btn plan-primary-action" type="button" onClick={() => onNavigate("/pricing")}>Compare plans <ArrowRight size={15} /></button>
              </div>
              <small className="plan-footnote">20 welcome credits after sign-in · Five Standard images</small>
            </div>
          </article>

          <article className={`card plan-decision plan-decision-secondary ${creatorAvailable ? "" : "is-unavailable"}`}>
            <div className="card-body">
              <div className="plan-decision-top">
                <span className="plan-eyebrow">For frequent creation</span>
                <span className={`plan-status ${creatorAvailable ? "is-available" : ""}`}>{creatorAvailable ? "Available" : "Not available yet"}</span>
              </div>
              <h3>{creatorPlan?.name ?? "Creator"}</h3>
              <p>{creatorPlan?.description ?? "Priority generation with clean original exports."}</p>
              <ul className="plan-feature-list">{(creatorPlan?.features ?? []).slice(0, 4).map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
              {creatorAvailable
                ? <button className="btn plan-primary-action" type="button" onClick={() => onRegister?.()}>Choose Creator <ArrowRight size={15} /></button>
                : <div className="plan-availability" role="status">Paid checkout is not enabled in this environment.</div>}
            </div>
          </article>
        </div>
      </section>

      <section className="marketing-section faq-section" id="faq">
        <div className="faq-layout">
          <header className="faq-intro">
            <div className="section-kicker">Straight answers</div>
            <h2>What you need to know.</h2>
            <p>Nothing is expanded until you ask for it. Start with account access, credits, model availability, or billing.</p>
          </header>
          <div className="faq-list">
            {faqs.map(([id, question, answer]) => (
              <details className="collapse collapse-plus faq-item" id={`faq-${id}`} key={id}>
                <summary className="collapse-title">{question}</summary>
                <div className="collapse-content"><p>{answer}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="content-page-intro"><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>{copy}</p></header>;
}

export function PromptsPage({ catalog, onUsePrompt }: { catalog: Catalog; onUsePrompt: (prompt: string) => void }) {
  const [copied, setCopied] = useState("");
  async function copy(id: string, prompt: string) { await navigator.clipboard.writeText(prompt); setCopied(id); window.setTimeout(() => setCopied(""), 1600); }
  return (
    <main className="content-page prompts-page">
      <PageIntro
        eyebrow="Prompt library"
        title="AI image prompts, explained."
        copy="Every template includes a complete visual reference for the subject, setting, light, and style. Copy one or send the full setup to the configured generator."
      />
      <div className="library-grid">
        {catalog.prompts.map((item, index) => {
          const media = promptMedia[item.id];
          return (
            <article className="card card-border library-card" key={item.id}>
              <figure className="library-media">
                <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading="lazy" decoding="async" />
                <figcaption>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.category}</strong>
                </figcaption>
              </figure>
              <div className="card-body">
                <span className="badge badge-outline">{item.category}</span>
                <h2 className="card-title">{item.title}</h2>
                <p>{item.prompt}</p>
                <div className="prompt-anatomy"><span>Subject</span><span>Setting</span><span>Light</span><span>Style</span></div>
                <div className="card-actions">
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => void copy(item.id, item.prompt)}><Copy size={14} />{copied === item.id ? "Copied" : "Copy"}</button>
                  <button className="btn btn-primary btn-sm" type="button" onClick={() => onUsePrompt(item.prompt)}>Use in generator <ArrowRight size={14} /></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

export function ExamplesPage({ catalog, onUsePrompt }: { catalog: Catalog; onUsePrompt: (prompt: string) => void }) {
  return (
    <main className="content-page examples-page">
      <PageIntro
        eyebrow="Visual prompt references"
        title="Start with an image direction you can understand."
        copy="Each attributed reference photo explains the composition, mood, and finish behind a ready-to-use prompt. References are creative guidance, not generated results."
      />
      <div className="example-gallery">
        {catalog.prompts.slice(0, 8).map((item) => {
          const media = exampleMedia[item.id];
          return (
            <article className="example-gallery-card" key={item.id}>
              {media && (
                <figure className="example-gallery-art">
                  <img src={media.src} alt={media.alt} width={media.width} height={media.height} loading="lazy" decoding="async" />
                  <figcaption>
                    <span>{item.category}</span>
                    <strong>{item.title}</strong>
                  </figcaption>
                </figure>
              )}
              <div className="example-gallery-body">
                <p>{item.prompt}</p>
                <div className="example-gallery-actions">
                  {media && (
                    <a className="link link-hover example-source-link" href={media.sourceUrl} target="_blank" rel="noreferrer">
                      Photo: {media.credit} <ArrowUpRight size={13} />
                    </a>
                  )}
                  <button className="btn btn-sm" type="button" onClick={() => onUsePrompt(item.prompt)}>Use this prompt <ArrowRight size={14} /></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

export function ModelsPage({ catalog, onNavigate }: { catalog: Catalog; onNavigate: (path: string) => void }) {
  const providerLabel = (provider: Catalog["models"][number]["provider"]) => provider === "local-preview"
    ? "Local preview"
    : provider === "alibaba-model-studio"
      ? "Alibaba Cloud Model Studio"
      : "Not assigned";
  return <main className="content-page"><PageIntro eyebrow="Model catalog" title="Qwen Image 3 model status, without the fog." copy="No verified Qwen Image 3 provider is available here today. Implemented and planned providers remain clearly separated from the working local preview." /><div className="model-table card card-border"><div className="overflow-x-auto"><table className="table"><thead><tr><th>Model</th><th>Provider</th><th>Status</th><th>Speed</th><th>Cost</th><th>Best for</th></tr></thead><tbody>{catalog.models.map((model) => <tr key={model.id}><td><strong>{model.name}</strong><small>{model.id}</small></td><td>{providerLabel(model.provider)}</td><td><span className={`badge ${model.status === "Available" ? "badge-success badge-soft" : "badge-warning badge-soft"}`}>{model.status}</span></td><td>{model.speed}</td><td>{model.cost}</td><td>{model.bestFor}</td></tr>)}</tbody></table></div></div><div className="content-cta card card-border"><div><h2>One contract across providers.</h2><p>Create a key in Studio and call the same generation endpoint as models are approved.</p></div><button className="btn btn-primary" type="button" onClick={() => onNavigate("/api")}>Read API guide <ArrowRight size={15} /></button></div></main>;
}

export function PricingPage({ catalog, onRegister }: { catalog: Catalog; onRegister: () => void }) {
  const [billingView, setBillingView] = useState<"plans" | "credits">("plans");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("yearly");
  const isYearly = billingPeriod === "yearly";
  const formatUsd = (amountCents: number, minimumFractionDigits = 0) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);

  return (
    <main className="content-page pricing-page">
      <PageIntro eyebrow="Simple, honest pricing" title="Pay for a clear image allowance." copy="Choose monthly flexibility or save two months with yearly billing. Every plan is account-based, private by default, and protected by automatic credit recovery after failures." />
      {catalog.creditPacks.length > 0 && (
        <div role="tablist" className="tabs tabs-box pricing-tabs pricing-view-tabs" aria-label="Pricing options">
          <button role="tab" type="button" className={`tab ${billingView === "plans" ? "tab-active" : ""}`} aria-selected={billingView === "plans"} onClick={() => setBillingView("plans")}>Plans</button>
          <button role="tab" type="button" className={`tab ${billingView === "credits" ? "tab-active" : ""}`} aria-selected={billingView === "credits"} onClick={() => setBillingView("credits")}>Credit packs</button>
        </div>
      )}

      {billingView === "plans" ? (
        <>
          <div className="pricing-cycle-row">
            <div role="tablist" className="tabs tabs-box pricing-cycle-tabs" aria-label="Billing period">
              <button
                role="tab"
                type="button"
                className={`tab ${billingPeriod === "monthly" ? "tab-active" : ""}`}
                aria-selected={billingPeriod === "monthly"}
                onClick={() => setBillingPeriod("monthly")}
              >
                Monthly
              </button>
              <button
                role="tab"
                type="button"
                className={`tab ${billingPeriod === "yearly" ? "tab-active" : ""}`}
                aria-selected={billingPeriod === "yearly"}
                onClick={() => setBillingPeriod("yearly")}
              >
                Yearly
                <span className="badge badge-sm">Save 2 months</span>
              </button>
            </div>
            <p id="billing-period-note">
              {isYearly
                ? "Yearly is selected by default. The full annual credit allowance is issued after the yearly invoice is paid."
                : "Monthly credits are issued after each successful monthly invoice."}
            </p>
          </div>

          <div className="pricing-plan-grid" data-billing-period={billingPeriod}>
            {catalog.plans.map((plan) => {
              const amountCents = isYearly ? plan.yearlyAmountCents : plan.monthlyAmountCents;
              const credits = isYearly ? plan.yearlyCredits : plan.monthlyCredits;
              const standardImages = credits / 4;
              const configured = isYearly ? plan.yearlyConfigured : plan.monthlyConfigured;
              const effectiveMonthly = isYearly ? plan.yearlyAmountCents / 12 : plan.monthlyAmountCents;
              const costPerCredit = amountCents / credits / 100;
              return (
                <article
                  className={`card pricing-plan-card pricing-plan-card-${plan.id} ${plan.recommended ? "is-recommended" : ""} ${configured ? "" : "is-unavailable"}`}
                  key={plan.id}
                >
                  {plan.recommended && <span className="badge pricing-popular-badge">Most popular</span>}
                  {plan.valuePick && <span className="badge badge-outline pricing-value-badge">Best unit price</span>}
                  <div className="card-body">
                    <div className="pricing-plan-card-header">
                      <span className="plan-eyebrow">
                        {plan.id === "starter" ? "For getting started" : plan.id === "creator" ? <><Crown size={14} /> For creators</> : "For production"}
                      </span>
                      <h2>{plan.name}</h2>
                      <p>{plan.description}</p>
                    </div>
                    <div className="pricing-price-block" aria-live="polite">
                      <strong>{formatUsd(amountCents, amountCents % 100 === 0 ? 0 : 2)}</strong>
                      <span>/ {isYearly ? "year" : "month"}</span>
                    </div>
                    <small className="pricing-price-support">
                      {isYearly
                        ? `${formatUsd(effectiveMonthly, 2)} monthly equivalent · billed yearly`
                        : "Billed monthly · manage or cancel through Stripe"}
                    </small>
                    <div className="pricing-capacity-summary">
                      <strong>{credits.toLocaleString("en-US")} credits</strong>
                      <span>Up to {standardImages.toLocaleString("en-US")} Standard images {isYearly ? "per year" : "per month"}</span>
                      <small>${costPerCredit.toFixed(3)} per credit</small>
                    </div>
                    <button
                      className={`btn pricing-plan-action ${plan.recommended ? "plan-primary-action" : "btn-outline"}`}
                      type="button"
                      disabled={!configured}
                      aria-describedby="billing-period-note"
                      onClick={onRegister}
                    >
                      {configured ? `Choose ${plan.name}` : "Checkout not enabled"}
                      {configured && <ArrowRight size={14} />}
                    </button>
                    <div className="pricing-feature-heading">Included</div>
                    <ul className="plan-feature-list">
                      {plan.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="pricing-trust-note">
            <ShieldCheck size={16} />
            <span>Generation requires an account. New accounts receive 20 welcome credits—enough for five Standard images. Failed requests restore reserved credits automatically.</span>
          </div>
        </>
      ) : (
        <div className="credit-pack-grid">
          {catalog.creditPacks.map((offer) => <article className={`card plan-decision credit-pack-card ${offer.id === "credits_3000" ? "is-featured" : ""}`} key={offer.id}><div className="card-body"><span className="plan-eyebrow">{offer.id === "credits_3000" ? "Best one-time value" : "Flexible top-up"}</span><div className="plan-decision-top"><h2>{offer.name}</h2><div className="plan-price">{offer.priceLabel}</div></div><p>{offer.description}</p><div className="billing-credit-count"><Coins size={16} /><span>{offer.credits.toLocaleString("en-US")} credits · up to {offer.standardImages?.toLocaleString("en-US")} Standard images</span></div><ul className="plan-feature-list">{offer.features.map((feature) => <li key={feature}><Check size={15} />{feature}</li>)}</ul>{offer.configured ? <button className="btn plan-primary-action" type="button" onClick={onRegister}>Buy in Studio <ArrowRight size={14} /></button> : <div className="plan-availability" role="status">Paid checkout is not enabled in this environment.</div>}</div></article>)}
        </div>
      )}

      <section className="alert alert-info alert-soft items-start" aria-labelledby="pricing-policy-title">
        <ShieldCheck size={18} />
        <div>
          <h2 id="pricing-policy-title" className="font-semibold">Know the billing terms before you buy</h2>
          <p>{billingPolicySummary[0]} {billingPolicySummary[2]}</p>
          <p>
            <a className="link" href="/terms">Read the Billing Terms</a>
            {" · "}
            <a className="link" href="/refund-policy">Read the Refund Policy</a>
          </p>
        </div>
      </section>

      <section className="credit-explainer"><h2>One transparent credit rule</h2><p>Standard uses 4 credits, High uses 8, and Ultra uses 16. Every request follows the same server-authoritative settlement flow.</p><div className="credit-flow"><span><b>1</b>Estimate</span><ArrowRight /><span><b>2</b>Reserve</span><ArrowRight /><span><b>3</b>Generate</span><ArrowRight /><span><b>4</b>Settle or refund</span></div></section>
    </main>
  );
}

function PolicySections({ sections }: { sections: ReadonlyArray<{ title: string; paragraphs: readonly string[] }> }) {
  return (
    <div className="grid gap-4">
      {sections.map((section) => (
        <section className="card card-border" key={section.title}>
          <div className="card-body">
            <h2 className="card-title">{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BillingTermsPage() {
  return (
    <main className="content-page">
      <PageIntro
        eyebrow="Billing policy"
        title="Billing Terms"
        copy="The recurring-payment, credit, cancellation, and payment-review rules that apply before a Stripe purchase."
      />
      <div role="alert" className="alert alert-info alert-soft">
        <ShieldCheck size={18} />
        <span>Version {BILLING_TERMS_VERSION} · Effective <time dateTime={BILLING_TERMS_VERSION}>{BILLING_TERMS_EFFECTIVE_DATE}</time></span>
      </div>
      <PolicySections sections={termsSections} />
      <div className="card card-border">
        <div className="card-body">
          <h2 className="card-title">Related policy</h2>
          <p>The detailed eligibility and account-handling rules for cash refunds are in the Refund Policy.</p>
          <div className="card-actions"><a className="btn btn-outline" href="/refund-policy">Read Refund Policy <ArrowRight size={14} /></a></div>
        </div>
      </div>
    </main>
  );
}

export function RefundPolicyPage() {
  return (
    <main className="content-page">
      <PageIntro
        eyebrow="Billing policy"
        title="Refund Policy"
        copy="How to request a refund, what cancellation changes, and how refunded or disputed credits are handled."
      />
      <div role="alert" className="alert alert-info alert-soft">
        <ShieldCheck size={18} />
        <span>Version {BILLING_TERMS_VERSION} · Effective <time dateTime={BILLING_TERMS_VERSION}>{BILLING_TERMS_EFFECTIVE_DATE}</time></span>
      </div>
      <PolicySections sections={refundPolicySections} />
      <div className="card card-border">
        <div className="card-body">
          <h2 className="card-title">Subscription terms</h2>
          <p>Automatic renewal, annual credit grants, taxes, and account-deletion billing cleanup are covered in the Billing Terms.</p>
          <div className="card-actions"><a className="btn btn-outline" href="/terms">Read Billing Terms <ArrowRight size={14} /></a></div>
        </div>
      </div>
    </main>
  );
}

export function GuidesPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const guides: Array<{ title: string; copy: string; duration: string; Icon: typeof BookOpen }> = [
    { title: "Five-minute first image", copy: "Go from a one-line idea to a downloadable result using recommended defaults.", duration: "4 min", Icon: WandSparkles },
    { title: "Prompt anatomy", copy: "Understand subject, setting, composition, light, style, and constraints.", duration: "7 min", Icon: BookOpen },
    { title: "Choosing image quality", copy: "Know when Standard, High, and Ultra are worth their credit cost.", duration: "5 min", Icon: Gauge },
    { title: "Private creative workflow", copy: "Organize projects, favorites, history, and API keys safely in Studio.", duration: "8 min", Icon: ShieldCheck },
  ];
  return <main className="content-page"><PageIntro eyebrow="Guides" title="Learn a repeatable AI image workflow." copy="Short, practical English guides designed for a first-time creator and useful enough for repeat production." /><div className="guide-grid">{guides.map(({ title, copy, duration, Icon }) => <article className="card card-border guide-card" key={title}><div className="card-body"><Icon /><span>{duration}</span><h2 className="card-title">{title}</h2><p>{copy}</p><div className="card-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => onNavigate("/")}>Try the workflow <ArrowRight size={14} /></button></div></div></article>)}</div></main>;
}

export function ApiPage({ models, onNavigate }: { models: Catalog["models"]; onNavigate: (path: string) => void }) {
  const modelId = models.find((model) => model.available)?.id ?? "<available-model-id>";
  const code = `curl -X POST https://qwen-image-3.net/v1/generations \\
  -H "Authorization: Bearer $QWEN_HUB_API_KEY" \\
  -H "Idempotency-Key: launch-001" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${modelId}","prompt":"A glass pavilion at dawn","aspect_ratio":"16:9","style":"editorial","quality":"high"}'`;
  return <main className="content-page"><PageIntro eyebrow="Developer API" title="Build with the provider-aware generation API." copy="Create a scoped key in Studio, submit the same model-neutral request, and rely on idempotent credit settlement." /><div className="api-layout"><section><div className="api-feature"><KeyRound /><div><h2>Hashed API keys</h2><p>The full secret appears once. The database stores only a SHA-256 hash and revocation state.</p></div></div><div className="api-feature"><Zap /><div><h2>Idempotent requests</h2><p>Repeat a request with the same key for 24 hours and receive the original generation without another charge.</p></div></div><div className="api-feature"><ShieldCheck /><div><h2>Shared private ledger</h2><p>Web and API usage reserve and settle against the same account balance.</p></div></div><button className="btn btn-primary" type="button" onClick={() => onNavigate("/studio/api-keys")}>Create an API key <ArrowRight size={15} /></button></section><section className="mockup-code api-code"><pre data-prefix="$"><code>{code}</code></pre></section></div></main>;
}
