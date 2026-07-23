import { ArrowRight, BookOpen, Check, Code2, Coins, Copy, Crown, Gauge, Image as ImageIcon, KeyRound, Layers3, ShieldCheck, Sparkles, WandSparkles, Zap } from "lucide-react";
import { useState } from "react";
import type { Catalog } from "../types";
import { PricingCountdown, usePromotionCountdown } from "./PricingCountdown";

export type { Catalog } from "../types";

interface NavigateProps {
  onNavigate: (path: string) => void;
  onUsePrompt?: (prompt: string) => void;
  onRegister?: () => void;
}

export function HomeSections({ catalog, onNavigate, onUsePrompt, onRegister }: { catalog: Catalog } & NavigateProps) {
  const faqs = [
    ["Can I generate without signing in?", "Yes. Every guest receives three private generations per day. Free previews and exports include a Qwen Image 3 watermark."],
    ["What happens to guest images?", "Guest images stay attached to the private browser session for up to 24 hours and can migrate when you create an account."],
    ["How do credits work?", "Standard costs 1 credit, High costs 2, and Ultra costs 4. Credits are reserved first and settled only after a successful result."],
    ["Are failed generations charged?", "No. A system or provider failure releases the reservation automatically and restores guest allowance."],
    ["Do VIP generations run faster?", "Yes. Active Creator subscribers enter the VIP priority lane immediately, ahead of requests waiting in the standard free queue."],
    ["Are my images public?", "No. Generations are private by default. Nothing is published without a separate explicit action."],
    ["Is Qwen Image 3 available in this generator?", "No verified Qwen Image 3 provider is currently available here. The product name describes the topic and integration target; the Models page shows the active provider and exact configured model before you generate."],
    ["What happens after a refund or dispute?", "Credit spending is paused for billing review, the financial event is shown in billing history, and no silent balance mutation is performed."],
    ["What does account deletion remove?", "Any Stripe subscription and customer are removed first, then local assets, projects, credits, sessions, keys, and connected identities are deleted."],
    ["Can I audit API use?", "Yes. Scoped API keys and recent request status, latency, and request IDs are available inside Studio."],
    ["Is this an official Qwen product?", "No. This is an independent third-party product and is not affiliated with or endorsed by Alibaba or the Qwen team."],
  ];

  return (
    <>
      <section className="marketing-section how-section" id="how-it-works">
        <div className="section-kicker">From idea to image</div><h2>Build a Qwen Image 3 prompt in three clear steps.</h2>
        <div className="steps-grid">
          <article className="card card-border process-card"><span>01</span><WandSparkles /><h3>Describe the idea</h3><p>Write the subject, setting, style, and light in the words you already use.</p></article>
          <article className="card card-border process-card"><span>02</span><Layers3 /><h3>Choose the format</h3><p>Pick an aspect ratio and quality tier. Recommended defaults keep the first run simple.</p></article>
          <article className="card card-border process-card"><span>03</span><ImageIcon /><h3>Create and refine</h3><p>Generate with the configured provider, then download, favorite, or make a variation. Keep the brief with projects and private history.</p></article>
        </div>
      </section>

      <section className="marketing-section seo-guide-section" id="qwen-image-3-guide">
        <div className="seo-guide-intro">
          <div>
            <div className="section-kicker">Practical guide</div>
            <h2>What to know before using a Qwen Image 3 prompt.</h2>
          </div>
          <p>
            Qwen Image 3 is the subject of this independent prompt and model-status hub, but it is not an
            availability promise. No verified Qwen Image 3 provider is connected here today. The generator
            uses whichever provider and model are identified on the <a className="link" href="/models">Models status page</a>,
            so you can separate prompt planning from the model that actually processes a request. That distinction
            matters: a useful creative workflow should make the active system visible before it asks you to spend
            time, credits, or money.
          </p>
        </div>

        <figure className="workflow-figure">
          <img
            src="/qwen-image-3-workflow.png"
            width="1200"
            height="630"
            loading="lazy"
            decoding="async"
            alt="Qwen Image 3 prompt workflow showing prompt writing, provider verification, and private image creation"
          />
          <figcaption>Write the brief, verify the configured provider, then generate and refine privately.</figcaption>
        </figure>

        <div className="seo-copy-grid">
          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Start with the subject and purpose</h3>
              <p>
                A strong prompt begins with the thing you need and the job the image must do. Name the subject
                precisely, then state whether the result is a product hero, editorial illustration, cinematic
                frame, architectural study, social post, or another deliverable. Add the essential attributes:
                material, color, age, scale, expression, or condition. “A perfume bottle” leaves most decisions
                open; “a cobalt glass perfume bottle for a restrained luxury campaign” gives the model a clearer
                hierarchy. Keep the core request near the beginning so later style details do not bury it.
              </p>
            </div>
          </article>

          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Describe scene, composition, and light</h3>
              <p>
                Next, explain where the subject is, how the camera sees it, and how light shapes the scene. Useful
                scene details include time of day, weather, surface, background, and atmosphere. Composition can
                specify a close-up, wide establishing view, overhead layout, centered poster, generous copy space,
                or low camera angle. Lighting phrases such as soft window light, hard noon sun, rim light, or
                diffused studio illumination are more actionable than simply asking for something “beautiful.”
                Choose only details that support the same visual idea.
              </p>
            </div>
          </article>

          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Use style as direction, not decoration</h3>
              <p>
                Style works best when it describes a coherent medium and finish. You might request documentary
                photography, editorial product photography, a screen-printed poster, a quiet watercolor
                illustration, or a polished three-dimensional render. Combine that with a controlled palette,
                texture, or level of realism. Avoid stacking unrelated labels just because they sound impressive;
                “minimalist, baroque, brutalist, dreamy, hyperreal” creates competing instructions. The
                <a className="link" href="/prompts"> prompt library</a> shows complete English examples that can be
                adapted without copying every adjective.
              </p>
            </div>
          </article>

          <article className="card card-border seo-copy-card">
            <div className="card-body">
              <h3 className="card-title">Add constraints and refine one variable at a time</h3>
              <p>
                Finish with constraints that protect the intended output: aspect ratio, empty space for a headline,
                a simple background, one visible product, readable material detail, or the absence of distracting
                objects. Generate a first result, identify the largest mismatch, and change one group of
                instructions at a time. If the composition is wrong, adjust framing before rewriting the palette.
                If the subject is correct but the mood is weak, change light and atmosphere. This controlled
                approach makes each variation easier to evaluate and turns prompt writing into a repeatable process.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="marketing-section workflow-notes" aria-labelledby="workflow-notes-title">
        <div className="section-kicker">Clear operating boundaries</div>
        <h2 id="workflow-notes-title">A private AI image workflow with visible model status.</h2>
        <div className="workflow-notes-grid">
          <article>
            <h3>Check the model before generating</h3>
            <p>
              Model names, provider configuration, speed, and status belong in one inspectable place. This hub
              currently supports a deterministic local preview and an optional adapter targeting Qwen Image 2.0
              Pro; neither should be mistaken for a verified Qwen Image 3 integration. Visit
              the <a className="link" href="/models">model comparison</a> whenever availability matters to your
              project. Planned or unconfigured options remain labeled instead of being presented as live features.
            </p>
          </article>
          <article>
            <h3>Understand free use and credits</h3>
            <p>
              A guest can try three generations per day without creating an account. Account requests use
              server-authoritative credits: Standard costs one credit, High costs two, and Ultra costs four.
              Credits are reserved before processing and settled only after a successful result. Provider or
              system failures release the reservation automatically. The <a className="link" href="/pricing">pricing page</a>
              explains free and planned paid options without hiding the generation cost behind a vague token total.
            </p>
          </article>
          <article>
            <h3>Keep work private by default</h3>
            <p>
              Generations are not placed in a public gallery. Guest work remains tied to the private browser
              session and guest assets are removed by the scheduled 24-hour maintenance pass. Creating an account
              can migrate eligible recent work into projects, history, and favorites. Free exports include a
              watermark, while original-export access depends on verified entitlement. Read the
              <a className="link" href="/guides"> workflow guides</a> before using sensitive or business-critical
              material, and never place passwords, access keys, or other secrets in a prompt.
            </p>
          </article>
        </div>
      </section>

      <section className="marketing-section examples-preview" id="examples">
        <div className="section-heading-row"><div><div className="section-kicker">Prompt recipes</div><h2>Start with a focused Qwen Image 3 prompt direction.</h2></div><button className="btn btn-ghost" type="button" onClick={() => onNavigate("/prompts")}>Browse all prompts <ArrowRight size={16} /></button></div>
        <div className="prompt-preview-grid">{catalog.prompts.slice(0, 4).map((item, index) => <article className="card prompt-preview-card" key={item.id}><div className={`prompt-art prompt-art-${index + 1}`}><span>{item.category}</span></div><div className="card-body"><h3 className="card-title">{item.title}</h3><p>{item.prompt}</p><div className="card-actions"><button className="btn btn-sm" type="button" onClick={() => onUsePrompt?.(item.prompt)}>Use this prompt <ArrowRight size={14} /></button></div></div></article>)}</div>
      </section>

      <section className="marketing-section model-preview">
        <div className="model-preview-copy"><div className="section-kicker">Transparent model layer</div><h2>Track Qwen Image 3 readiness before you spend.</h2><p>The Models page reports the implemented provider and exact configured model. Unverified releases are never advertised as available.</p><button className="btn" type="button" onClick={() => onNavigate("/models")}>Compare models <ArrowRight size={16} /></button></div>
        <div className="model-signal-card card card-border">{catalog.models.map((model) => <div className="signal-line" key={model.id}><span className={`status ${model.status === "Available" ? "status-success" : "status-warning"}`} />{model.name}<strong>{model.status}</strong></div>)}<div className="signal-metrics"><span><Gauge />Status from server configuration</span><span><ShieldCheck />Private by default</span><span><Code2 />Stable provider boundary</span></div></div>
      </section>

      <section className="marketing-section pricing-preview" id="pricing">
        <div className="section-kicker">Start without a card</div><h2>Try the image workflow before creating an account.</h2>
        <div className="pricing-grid">{catalog.plans.map((plan) => <article className={`card card-border pricing-card ${plan.id === "free" ? "pricing-featured" : ""}`} key={plan.id}>{plan.id === "free" && <span className="badge">Recommended start</span>}<div className="card-body"><h3>{plan.name}</h3><div className="plan-price">{plan.price}</div><p>{plan.description}</p><ul>{plan.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul><div className="card-actions"><button className="btn btn-block" type="button" disabled={plan.planned} onClick={() => plan.id === "guest" ? onNavigate("/") : onRegister?.()}>{plan.planned ? "Coming after MVP" : plan.id === "guest" ? "Generate as guest" : "Create free account"}</button></div></div></article>)}</div>
      </section>

      <section className="marketing-section faq-section" id="faq"><div className="section-kicker">Straight answers</div><h2>Qwen Image 3 questions, answered clearly.</h2><div className="faq-list">{faqs.map(([question, answer], index) => <div className="collapse collapse-plus faq-item" key={question}><input type="radio" name="homepage-faq" defaultChecked={index === 0} /><div className="collapse-title">{question}</div><div className="collapse-content"><p>{answer}</p></div></div>)}</div></section>
    </>
  );
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="content-page-intro"><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>{copy}</p></header>;
}

export function PromptsPage({ catalog, onUsePrompt }: { catalog: Catalog; onUsePrompt: (prompt: string) => void }) {
  const [copied, setCopied] = useState("");
  async function copy(id: string, prompt: string) { await navigator.clipboard.writeText(prompt); setCopied(id); window.setTimeout(() => setCopied(""), 1600); }
  return <main className="content-page"><PageIntro eyebrow="Prompt library" title="Qwen Image 3 prompts, explained." copy="Practical English templates for products, campaigns, spaces, posters, and cinematic scenes. Copy one or send the complete setup to the configured generator." /><div className="library-grid">{catalog.prompts.map((item, index) => <article className="card card-border library-card" key={item.id}><div className={`library-index prompt-art-${index + 1}`}>{String(index + 1).padStart(2, "0")}</div><div className="card-body"><span className="badge badge-outline">{item.category}</span><h2 className="card-title">{item.title}</h2><p>{item.prompt}</p><div className="prompt-anatomy"><span>Subject</span><span>Setting</span><span>Light</span><span>Style</span></div><div className="card-actions"><button className="btn btn-ghost btn-sm" type="button" onClick={() => void copy(item.id, item.prompt)}><Copy size={14} />{copied === item.id ? "Copied" : "Copy"}</button><button className="btn btn-sm" type="button" onClick={() => onUsePrompt(item.prompt)}>Use in generator <ArrowRight size={14} /></button></div></div></article>)}</div></main>;
}

export function ExamplesPage({ catalog, onUsePrompt }: { catalog: Catalog; onUsePrompt: (prompt: string) => void }) {
  return <main className="content-page"><PageIntro eyebrow="Prompt examples" title="Qwen Image 3 examples you can reuse." copy="Every example exposes its prompt direction and runs through the same provider-aware generator available on the homepage." /><div className="example-gallery">{catalog.prompts.slice(0, 8).map((item, index) => <article className="example-gallery-card" key={item.id}><div className={`example-gallery-art prompt-art-${index % 4 + 1}`}><span>{item.category}</span><strong>{item.title}</strong></div><div><p>{item.prompt}</p><button className="btn btn-sm" type="button" onClick={() => onUsePrompt(item.prompt)}>Use setup <ArrowRight size={14} /></button></div></article>)}</div></main>;
}

export function ModelsPage({ catalog, onNavigate }: { catalog: Catalog; onNavigate: (path: string) => void }) {
  return <main className="content-page"><PageIntro eyebrow="Model catalog" title="Qwen Image 3 model status, without the fog." copy="No verified Qwen Image 3 provider is available here today. Implemented and planned providers remain clearly separated from the working local preview." /><div className="model-table card card-border"><div className="overflow-x-auto"><table className="table"><thead><tr><th>Model</th><th>Status</th><th>Speed</th><th>Cost</th><th>Best for</th></tr></thead><tbody>{catalog.models.map((model) => <tr key={model.id}><td><strong>{model.name}</strong><small>{model.id}</small></td><td><span className={`badge ${model.status === "Available" ? "badge-success badge-soft" : "badge-warning badge-soft"}`}>{model.status}</span></td><td>{model.speed}</td><td>{model.cost}</td><td>{model.bestFor}</td></tr>)}</tbody></table></div></div><div className="content-cta card card-border"><div><h2>One contract across providers.</h2><p>Create a key in Studio and call the same generation endpoint as models are approved.</p></div><button className="btn" type="button" onClick={() => onNavigate("/api")}>Read API guide <ArrowRight size={15} /></button></div></main>;
}

export function PricingPage({ catalog, onNavigate, onRegister }: { catalog: Catalog; onNavigate: (path: string) => void; onRegister: () => void }) {
  const [billingView, setBillingView] = useState<"plans" | "credits">("plans");
  const promotionState = usePromotionCountdown(catalog.promotion);
  const guest = catalog.plans.find((plan) => plan.id === "guest");
  const free = catalog.plans.find((plan) => plan.id === "free");
  const creator = catalog.plans.find((plan) => plan.id === "creator");
  const standardAmount = (catalog.promotion?.standardAmountCents ?? 1000) / 100;
  const promotionalAmount = (catalog.promotion?.promotionalAmountCents ?? 800) / 100;
  const creatorAmount = promotionState.active ? promotionalAmount : standardAmount;

  return (
    <main className="content-page pricing-page">
      <PageIntro eyebrow="Simple, honest pricing" title="Choose an image generation plan." copy="Free images include a watermark and use the standard queue. Creator VIP adds clean original exports, priority processing, and a monthly credit allowance." />
      {catalog.promotion && <PricingCountdown state={promotionState} />}
      <div role="tablist" className="tabs tabs-box pricing-tabs" aria-label="Pricing options">
        <button role="tab" type="button" className={`tab ${billingView === "plans" ? "tab-active" : ""}`} aria-selected={billingView === "plans"} onClick={() => setBillingView("plans")}>Plans</button>
        <button role="tab" type="button" className={`tab ${billingView === "credits" ? "tab-active" : ""}`} aria-selected={billingView === "credits"} onClick={() => setBillingView("credits")}>Credit packs</button>
      </div>

      {billingView === "plans" ? (
        <div className="pricing-offer-layout">
          <div className="pricing-free-stack">
            {[guest, free].filter(Boolean).map((plan) => <article className="card card-border pricing-compact-card" key={plan!.id}><div className="card-body"><div className="pricing-card-heading"><div><span className="pricing-plan-label">{plan!.id === "guest" ? "No account" : "Verified account"}</span><h2>{plan!.name}</h2></div><div className="plan-price">{plan!.price}</div></div><p>{plan!.description}</p><ul>{plan!.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul><div className="card-actions"><button className="btn btn-ghost btn-block" type="button" onClick={() => plan!.id === "guest" ? onNavigate("/") : onRegister()}>{plan!.id === "guest" ? "Generate as guest" : "Create free account"}<ArrowRight size={14} /></button></div></div></article>)}
          </div>

          <article className="card card-border pricing-creator-card">
            <div className="pricing-recommended">Best value</div>
            <div className="card-body">
              <div className="pricing-card-heading"><div><span className="pricing-plan-label"><Crown size={14} />Priority production</span><h2>{creator?.name ?? "Creator VIP"}</h2></div><span className="badge badge-warning badge-soft">Monthly</span></div>
              <div className="creator-price-row">
                {promotionState.active && <del>${standardAmount}</del>}
                <strong>${creatorAmount}</strong>
                <span>/ month</span>
                {promotionState.active && <span className="badge badge-error badge-soft">Save 20%</span>}
              </div>
              <p>{creator?.description ?? "Priority generation with a clear monthly allowance."}</p>
              <div className="pricing-capacity"><Coins size={17} /><span><strong>300 credits</strong><small>Up to 300 Standard, 150 High, or 75 Ultra images</small></span></div>
              <ul>{(creator?.features ?? []).map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul>
              <div className="card-actions"><button className="btn btn-block" type="button" disabled={creator?.planned} onClick={onRegister}>{creator?.planned ? "Checkout setup required" : promotionState.active ? "Claim $8 Creator price" : "Upgrade for $10 monthly"}<ArrowRight size={15} /></button></div>
              <small className="pricing-fine-print">Cancel in Stripe · No annual lock-in · Failed generations restore credits automatically</small>
            </div>
          </article>
        </div>
      ) : (
        <div className="credit-pack-grid">
          {catalog.creditPacks.map((offer) => <article className={`card card-border credit-pack-card ${offer.id === "credits_300" ? "is-featured" : ""}`} key={offer.id}><div className="card-body"><span className="pricing-plan-label">{offer.id === "credits_300" ? "Lower cost per credit" : "Flexible top-up"}</span><div className="pricing-card-heading"><h2>{offer.name}</h2>{offer.id === "credits_300" && <span className="badge badge-outline">Recommended</span>}</div><div className="plan-price">{offer.priceLabel}</div><p>{offer.description}</p><ul>{offer.features.map((feature) => <li key={feature}><Check size={14} />{feature}</li>)}</ul><div className="card-actions"><button className="btn btn-block" type="button" disabled={!offer.configured} onClick={onRegister}>{offer.configured ? "Buy in Studio" : "Checkout setup required"}<ArrowRight size={14} /></button></div></div></article>)}
        </div>
      )}

      <section className="pricing-comparison-strip" aria-label="Plan differences"><div><Gauge /><span><strong>Standard</strong><small>Free queue + watermarked exports</small></span></div><ArrowRight /><div><Zap /><span><strong>Creator VIP</strong><small>Priority queue + clean originals</small></span></div><ArrowRight /><div><ShieldCheck /><span><strong>Private by default</strong><small>No public gallery in any plan</small></span></div></section>

      <section className="credit-explainer"><h2>Settlement you can inspect</h2><p>Every request follows the same server-authoritative credit flow.</p><div className="credit-flow"><span><b>1</b>Estimate</span><ArrowRight /><span><b>2</b>Reserve</span><ArrowRight /><span><b>3</b>Generate</span><ArrowRight /><span><b>4</b>Settle or refund</span></div></section>
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

export function ApiPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const code = `curl -X POST http://127.0.0.1:8787/v1/generations \\\n+  -H "Authorization: Bearer $QWEN_HUB_API_KEY" \\\n+  -H "Idempotency-Key: launch-001" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{"prompt":"A glass pavilion at dawn","aspect_ratio":"16:9","style":"editorial","quality":"high"}'`;
  return <main className="content-page"><PageIntro eyebrow="Developer API" title="Build with the provider-aware generation API." copy="Create a scoped key in Studio, submit the same model-neutral request, and rely on idempotent credit settlement." /><div className="api-layout"><section><div className="api-feature"><KeyRound /><div><h2>Hashed API keys</h2><p>The full secret appears once. The database stores only a SHA-256 hash and revocation state.</p></div></div><div className="api-feature"><Zap /><div><h2>Idempotent requests</h2><p>Repeat a request with the same key for 24 hours and receive the original generation without another charge.</p></div></div><div className="api-feature"><ShieldCheck /><div><h2>Shared private ledger</h2><p>Web and API usage reserve and settle against the same account balance.</p></div></div><button className="btn" type="button" onClick={() => onNavigate("/studio/api-keys")}>Create an API key <ArrowRight size={15} /></button></section><section className="mockup-code api-code"><pre data-prefix="$"><code>{code}</code></pre></section></div></main>;
}
