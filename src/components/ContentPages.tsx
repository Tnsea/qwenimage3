import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  Layers3,
  MousePointer2,
  ScanText,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import {
  contentDocumentForPath,
  contentDocumentsForKind,
  MIDJOURNEY_VERSION_URL,
  promptExamples,
  QWEN_CHAT_URL,
  QWEN_IMAGE_3_API_URL,
  QWEN_IMAGE_3_RELEASE_URL,
  type ContentDocument,
  type PromptExample,
} from "../content";

interface ContentNavigateProps {
  onNavigate: (path: string) => void;
  onUsePrompt: (prompt: string) => void;
}

function followInternal(onNavigate: (path: string) => void, path: string) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(path);
  };
}

function InternalLink({
  path,
  onNavigate,
  className = "link",
  children,
}: {
  path: string;
  onNavigate: (path: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return <a className={className} href={path} onClick={followInternal(onNavigate, path)}>{children}</a>;
}

function ExternalSource({ href, children }: { href: string; children: ReactNode }) {
  return <a className="link" href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={13} aria-hidden="true" /></a>;
}

function ArticleLayout({
  document,
  toc,
  related,
  onNavigate,
  children,
}: {
  document: ContentDocument;
  toc: Array<{ id: string; label: string }>;
  related: ContentDocument[];
  onNavigate: (path: string) => void;
  children: ReactNode;
}) {
  const sectionPath = document.kind === "blog" ? "/blog" : "/guides";
  const sectionLabel = document.kind === "blog" ? "Blog" : "Guides";

  return (
    <main className="content-page article-page">
      <div className="breadcrumbs article-breadcrumbs" aria-label="Breadcrumb">
        <ul>
          <li><InternalLink path="/" onNavigate={onNavigate}>Home</InternalLink></li>
          <li><InternalLink path={sectionPath} onNavigate={onNavigate}>{sectionLabel}</InternalLink></li>
          <li aria-current="page">{document.h1}</li>
        </ul>
      </div>

      <article>
        <header className="article-hero">
          <div className="section-kicker">{document.kind === "blog" ? "Model comparison" : "Qwen Image 3 guide"}</div>
          <h1>{document.h1}</h1>
          <p className="article-deck">{document.excerpt}</p>
          <div className="article-meta">
            <span>By {document.author}</span>
            <span>Published <time dateTime={document.publishedAt}>July 25, 2026</time></span>
            <span>Updated <time dateTime={document.updatedAt}>July 25, 2026</time></span>
            <span>{document.readTime} read</span>
          </div>
        </header>

        <div role="alert" className="alert alert-warning alert-soft article-status-alert">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Official model, independent site.</strong>
            <span>Qwen announced Qwen-Image-3.0 on July 21, 2026. This site has not connected or externally accepted a Qwen Image 3 provider; its generator always shows the model currently available before a request.</span>
          </div>
        </div>

        <details className="collapse collapse-arrow article-mobile-toc">
          <summary className="collapse-title">On this page</summary>
          <div className="collapse-content">
            <ol>{toc.map((item) => <li key={item.id}><a className="link" href={`#${item.id}`}>{item.label}</a></li>)}</ol>
          </div>
        </details>

        <div className="article-layout">
          <aside className="article-toc" aria-label="On this page">
            <span>On this page</span>
            <ol>{toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ol>
          </aside>

          <div className="article-body">
            {children}

            <section className="article-conversion card card-border" aria-labelledby={`${document.slug}-cta`}>
              <div className="card-body">
                <span className="badge badge-outline">Current workspace</span>
                <h3 className="card-title" id={`${document.slug}-cta`}>Try the available image workflow.</h3>
                <p>The generator identifies its actual provider and model before every request. It does not currently claim to run Qwen Image 3.</p>
                <div className="card-actions">
                  <InternalLink className="btn" path="/" onNavigate={onNavigate}>Open generator <ArrowRight size={15} /></InternalLink>
                  <InternalLink className="btn btn-ghost" path="/models" onNavigate={onNavigate}>Check model status</InternalLink>
                </div>
              </div>
            </section>

            <section className="article-related" aria-labelledby={`${document.slug}-related`}>
              <h3 id={`${document.slug}-related`}>Continue reading</h3>
              <div className="article-related-grid">
                {related.map((item) => (
                  <article className="card card-border" key={item.path}>
                    <div className="card-body">
                      <span>{item.kind === "blog" ? "Comparison" : item.readTime}</span>
                      <h4 className="card-title">{item.h1}</h4>
                      <p>{item.excerpt}</p>
                      <div className="card-actions"><InternalLink className="btn btn-ghost btn-sm" path={item.path} onNavigate={onNavigate}>Read next <ArrowRight size={14} /></InternalLink></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="article-sources" aria-labelledby={`${document.slug}-sources`}>
              <h3 id={`${document.slug}-sources`}>Sources and methodology</h3>
              <p>This page separates documented model or product capabilities from this site's own runtime. Official demonstrations are not treated as an independent benchmark.</p>
              <ul>
                {document.sources.map((source) => (
                  <li key={source.url}>
                    <ExternalSource href={source.url}>{source.label}</ExternalSource>
                    <span>{source.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </article>
    </main>
  );
}

function ArticleFaq({
  document,
  id,
}: {
  document: ContentDocument;
  id: string;
}) {
  return (
    <section className="article-section article-faq" aria-labelledby={id}>
      <h2 id={id}>FAQ</h2>
      <div className="article-faq-list">
        {document.faqs.map((faq) => (
          <details className="collapse collapse-arrow card card-border" key={faq.question}>
            <summary className="collapse-title">{faq.question}</summary>
            <div className="collapse-content"><p>{faq.answer}</p></div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="article-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function StepVisual({
  step,
  title,
  items,
}: {
  step: string;
  title: string;
  items: string[];
}) {
  return (
    <figure className="article-step-visual">
      <figcaption><span>{step}</span>{title}</figcaption>
      <div>{items.map((item, index) => <span key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}</span>)}</div>
    </figure>
  );
}

function ComparisonPage({ onNavigate }: ContentNavigateProps) {
  const document = contentDocumentForPath("/blog/qwen-image-3-vs-midjourney")!;
  const toc = [
    ["quick-verdict", "Quick Verdict: Who Should Use Which?"],
    ["what-is-qwen", "What Is Qwen Image 3?"],
    ["what-is-midjourney", "What Is Midjourney?"],
    ["comparison-table", "Side-by-Side Comparison Table"],
    ["text-rendering", "Text Rendering Accuracy"],
    ["prompt-length", "Prompt Length"],
    ["multilingual", "Multilingual Image Generation"],
    ["pricing-comparison", "Pricing Comparison"],
    ["when-qwen", "When to Use Qwen Image 3"],
    ["when-midjourney", "When to Use Midjourney"],
    ["comparison-faq", "FAQ"],
  ].map(([id, label]) => ({ id, label }));
  const related = [
    contentDocumentForPath("/guides/qwen-image-3-tutorial")!,
    contentDocumentForPath("/guides/how-to-generate-ai-images-with-qwen-image-3")!,
    contentDocumentForPath("/guides/best-prompts-for-qwen-image-3")!,
  ];

  return (
    <ArticleLayout document={document} toc={toc} related={related} onNavigate={onNavigate}>
      <section className="article-section" aria-labelledby="quick-verdict">
        <h2 id="quick-verdict">Quick Verdict: Who Should Use Which?</h2>
        <div className="verdict-grid">
          <div className="card card-border"><div className="card-body"><ScanText /><h3 className="card-title">Choose Qwen Image 3 for structured visual work</h3><p>Its official release is unusually specific about long briefs, dense documents, small text, multilingual layouts, nested interfaces, and editing.</p></div></div>
          <div className="card card-border"><div className="card-body"><Sparkles /><h3 className="card-title">Choose Midjourney for a mature creative system</h3><p>Its current documentation centers on concise prompting, style controls, references, personalization, variations, and a broad visual community.</p></div></div>
        </div>
        <p className="answer-first">There is no defensible single winner yet. This first edition compares official documentation, not paired outputs from a controlled benchmark.</p>
      </section>

      <section className="article-section" aria-labelledby="what-is-qwen">
        <h2 id="what-is-qwen">What Is Qwen Image 3?</h2>
        <p>Qwen-Image-3.0 is the third-generation foundational image model announced by the Qwen team on July 21, 2026. The launch groups its improvements under three ideas: rich content, authentic details, and deep knowledge.</p>
        <div className="article-metrics">
          <Metric value="4.5k" label="documented input tokens" />
          <Metric value="~10px" label="documented small-text target" />
          <Metric value="12" label="native rendering languages" />
        </div>
        <p>The announcement demonstrates a 3×3 board generated in one pass, nested interface scenes, formula-heavy pages, realistic textures, multilingual text, and editing. Alibaba Cloud separately documents <code>qwen-image-3.0-pro</code> for text-to-image and one-to-three-reference-image editing, with access currently described as invite-only.</p>
        <ExternalSource href={QWEN_IMAGE_3_RELEASE_URL}>Read the official Qwen release</ExternalSource>
      </section>

      <section className="article-section" aria-labelledby="what-is-midjourney">
        <h2 id="what-is-midjourney">What Is Midjourney?</h2>
        <p>Midjourney is a subscription image and video creation service available through its website and Discord. Its current default model is V8.1, which Midjourney says became the default on June 10, 2026 and adds native 2K HD images alongside its reference, personalization, variation, and parameter workflows.</p>
        <p>Midjourney's own prompt guide recommends short, clear phrases rather than long lists. Its text guide supports quoted words or phrases, but says shorter text and the standard Latin alphabet offer the best chance of accuracy.</p>
        <ExternalSource href={MIDJOURNEY_VERSION_URL}>Review Midjourney's current version documentation</ExternalSource>
      </section>

      <section className="article-section" aria-labelledby="comparison-table">
        <h2 id="comparison-table">Side-by-Side Comparison Table</h2>
        <div className="overflow-x-auto article-table">
          <table className="table">
            <thead><tr><th>Dimension</th><th>Qwen Image 3</th><th>Midjourney</th></tr></thead>
            <tbody>
              <tr><th>Text rendering accuracy</th><td>Officially demonstrates text at approximately 10px, formulas, and dense document layouts.</td><td>Supports quoted text; official guidance favors short phrases and standard Latin characters.</td></tr>
              <tr><th>Maximum prompt length</th><td>Official launch states up to about 4.5k input tokens.</td><td>No comparable token claim in the reviewed guide; short and simple prompts are recommended.</td></tr>
              <tr><th>Languages inside images</th><td>Officially states native rendering across 12 languages.</td><td>Text guide explicitly says the standard Latin alphabet works best.</td></tr>
              <tr><th>Dense and nested layouts</th><td>Launch examples include a 3×3 information board and interface-within-interface scenes.</td><td>Can combine image prompts, references, and parameters, but its documentation does not make the same dense-document claim.</td></tr>
              <tr><th>Image editing</th><td>Alibaba Cloud documents one-to-three reference images plus precise editing instructions.</td><td>Provides Editor, image prompts, variations, pan, zoom, and related modification tools.</td></tr>
              <tr><th>Pricing</th><td>Official access and API terms vary; the reviewed API is invite-only. No price is inferred here.</td><td>Official monthly plans are $10, $30, $60, and $120, subject to change.</td></tr>
              <tr><th>API availability</th><td>Alibaba Cloud documents an invite-only qwen-image-3.0-pro API.</td><td>Community guidelines say an API is not generally provided, except rare explicit grants.</td></tr>
              <tr><th>Privacy model</th><td>Not specified by the launch post; check the terms of the access surface you use.</td><td>Creations are open by default; Stealth Mode is documented for Pro and Mega plans.</td></tr>
              <tr><th>Best fit</th><td>Information-dense documents, multilingual layouts, UI scenes, storyboards, and precise editing briefs.</td><td>Creative exploration, style development, references, personalization, iterative variations, and community discovery.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="article-section" aria-labelledby="text-rendering">
        <h2 id="text-rendering">Text Rendering Accuracy — Qwen Image 3&apos;s Killer Feature</h2>
        <p>Qwen's most differentiated documented claim is not merely that it can place a short title in an image. The release shows dense newspaper-like pages, mathematical notation, annotations, interface labels, and other compact visual information. It describes text rendered at approximately 10px.</p>
        <p>Midjourney can place text in images from version 6 onward when words are enclosed in double quotation marks. Its guide recommends shorter words or phrases, standard Latin characters, Raw mode, or lower Stylize values when exact text matters.</p>
        <div role="note" className="alert alert-info alert-soft"><ScanText size={18} /><span>Official examples are demonstrations, not a guarantee. Proofread every generated word, number, formula, and label before use.</span></div>
      </section>

      <section className="article-section" aria-labelledby="prompt-length">
        <h2 id="prompt-length">Prompt Length: 4.5k Tokens vs Midjourney&apos;s Short Prompts</h2>
        <p>Qwen Image 3's 4.5k-token input target is designed for specification-like briefs: multiple panels, exact text, nested visual regions, and detailed constraints in one request. The official 3×3 grid example reportedly uses a 3.7k-token instruction.</p>
        <p>Midjourney takes a different approach. Its prompt guide says short and simple prompts typically work best, with advanced control supplied through image prompts, style references, character or object references, weights, and parameters.</p>
        <p>This is a workflow difference, not a universal quality score: Qwen invites a production brief, while Midjourney encourages a compact visual direction plus dedicated controls.</p>
      </section>

      <section className="article-section" aria-labelledby="multilingual">
        <h2 id="multilingual">Multilingual Image Generation</h2>
        <p>Qwen's official release states native text rendering in 12 languages and shows Japanese, Korean, and Spanish examples. That makes it a documented candidate for multilingual posters, product pages, educational boards, and interfaces where language is part of the composition.</p>
        <p>Midjourney may render non-Latin text, but its current text guide explicitly says the standard Latin alphabet works best. For multilingual production, neither documentation nor a strong sample is enough: validate spelling, punctuation, diacritics, line breaking, and font suitability with a native speaker.</p>
        <InternalLink path="/guides/best-prompts-for-qwen-image-3" onNavigate={onNavigate}>See structured multilingual prompt examples</InternalLink>
      </section>

      <section className="article-section" aria-labelledby="pricing-comparison">
        <h2 id="pricing-comparison">Pricing Comparison</h2>
        <p>Midjourney publishes four monthly subscription tiers: Basic at $10, Standard at $30, Pro at $60, and Mega at $120. Annual billing receives a documented discount, while Stealth Mode is limited to Pro and Mega.</p>
        <p>Qwen's launch post directs users to Qwen Chat, and Alibaba Cloud documents an invite-only API. Because public price and quota terms can vary by region, account, and access surface, this comparison does not manufacture a single Qwen Image 3 price.</p>
        <p>This site's own <InternalLink path="/pricing" onNavigate={onNavigate}>credit plans</InternalLink> apply to its currently available runtime, not Qwen Image 3.</p>
      </section>

      <section className="article-section" aria-labelledby="when-qwen">
        <h2 id="when-qwen">When to Use Qwen Image 3</h2>
        <ul className="article-check-list">
          <li><Check size={16} />Your brief contains many exact sections, labels, formulas, or panels.</li>
          <li><Check size={16} />You need multilingual text to be part of the image, not added later.</li>
          <li><Check size={16} />You are building UI mockups, infographics, exam sheets, storyboards, or document-like visuals.</li>
          <li><Check size={16} />You want to edit one to three reference images with natural-language instructions.</li>
        </ul>
        <p>Use the <InternalLink path="/guides/qwen-image-3-tutorial" onNavigate={onNavigate}>complete Qwen Image 3 tutorial</InternalLink> to turn those requirements into a structured brief.</p>
      </section>

      <section className="article-section" aria-labelledby="when-midjourney">
        <h2 id="when-midjourney">When to Use Midjourney</h2>
        <ul className="article-check-list">
          <li><Check size={16} />You want fast visual exploration from concise creative direction.</li>
          <li><Check size={16} />Style references, personalization, moodboards, and variations are central to your process.</li>
          <li><Check size={16} />You value an established website, Discord workflow, and community discovery surface.</li>
          <li><Check size={16} />Your output is primarily artistic or photographic rather than a dense information layout.</li>
        </ul>
        <p>For an actual decision, run the same production brief through both systems and score text, composition, iteration time, cost, and correction effort.</p>
      </section>

      <ArticleFaq document={document} id="comparison-faq" />
    </ArticleLayout>
  );
}

function HowToPage({ onNavigate }: ContentNavigateProps) {
  const document = contentDocumentForPath("/guides/how-to-generate-ai-images-with-qwen-image-3")!;
  const toc = [
    ["before-starting", "What You Need Before Starting"],
    ["write-prompt", "Step 1 — Write Your First Prompt"],
    ["choose-model", "Step 2 — Choose the Right Model"],
    ["select-ratio", "Step 3 — Select Aspect Ratio"],
    ["generate-review", "Step 4 — Generate and Review"],
    ["download-use", "Step 5 — Download and Use Your Image"],
    ["pro-tips", "Pro Tips for Better Results"],
    ["mistakes", "Common Mistakes to Avoid"],
    ["how-to-faq", "FAQ"],
  ].map(([id, label]) => ({ id, label }));
  const related = [
    contentDocumentForPath("/guides/qwen-image-3-tutorial")!,
    contentDocumentForPath("/guides/best-prompts-for-qwen-image-3")!,
    contentDocumentForPath("/blog/qwen-image-3-vs-midjourney")!,
  ];

  return (
    <ArticleLayout document={document} toc={toc} related={related} onNavigate={onNavigate}>
      <section className="article-section" aria-labelledby="before-starting">
        <h2 id="before-starting">What You Need Before Starting</h2>
        <p>You need an official access path and a brief worth testing. The Qwen launch links to Qwen Chat. Alibaba Cloud separately documents <code>qwen-image-3.0-pro</code> as an invite-only text-to-image and image-editing API.</p>
        <div className="article-callout-grid">
          <div className="card card-border"><div className="card-body"><WandSparkles /><h3 className="card-title">For individual exploration</h3><p>Use the official Qwen Chat surface and review the account terms that apply there.</p><a className="btn btn-ghost btn-sm" href={QWEN_CHAT_URL} target="_blank" rel="noopener noreferrer">Open Qwen Chat <ExternalLink size={14} /></a></div></div>
          <div className="card card-border"><div className="card-body"><FileText /><h3 className="card-title">For API evaluation</h3><p>Review region, invite access, input-image rules, output limits, cost, data terms, and failure behavior before integration.</p><a className="btn btn-ghost btn-sm" href={QWEN_IMAGE_3_API_URL} target="_blank" rel="noopener noreferrer">Read API reference <ExternalLink size={14} /></a></div></div>
        </div>
        <p>Prepare exact text, factual source material, brand rules, reference images you are authorized to use, and a checklist for reviewing the result.</p>
      </section>

      <section className="article-section" aria-labelledby="write-prompt">
        <h2 id="write-prompt">Step 1 — Write Your First Prompt</h2>
        <p>Start with a compact structured brief instead of a stream of adjectives. Name the output, canvas, hierarchy, subject, exact text, visual system, and final checks.</p>
        <div className="article-code-block">
          <code>Output: museum exhibition poster{"\n"}Canvas: portrait, generous margins{"\n"}Headline: &quot;THE WEIGHT OF LIGHT&quot;{"\n"}Subject: three translucent glass objects on black stone{"\n"}Details: label each object Vessel I, Vessel II, Vessel III{"\n"}Style: restrained editorial photography{"\n"}Check: exact spelling, clean grid, no extra copy</code>
        </div>
        <StepVisual step="01" title="Build the brief in layers" items={["Output and canvas", "Exact text", "Composition", "Style and light", "Verification"]} />
        <p>For more patterns, open the <InternalLink path="/guides/best-prompts-for-qwen-image-3" onNavigate={onNavigate}>50-prompt library</InternalLink>.</p>
      </section>

      <section className="article-section" aria-labelledby="choose-model">
        <h2 id="choose-model">Step 2 — Choose the Right Model</h2>
        <div className="overflow-x-auto article-table">
          <table className="table">
            <thead><tr><th>Model</th><th>Current status here</th><th>Use it when</th></tr></thead>
            <tbody>
              <tr><th>Qwen Image 3</th><td><span className="badge badge-warning badge-soft">Not connected</span></td><td>You have official Qwen Chat access or Alibaba Cloud invite access and need the documented long-prompt, dense-text, multilingual, or editing capabilities.</td></tr>
              <tr><th>Kie.ai Qwen Image 2</th><td><span className="badge badge-success badge-soft">Acceptance runtime</span></td><td>You want to use this site's current four-credit Standard generation path. One signed-in success is recorded; failure, timeout, commercial, and production approval remain pending.</td></tr>
              <tr><th>Alibaba Qwen Image 2.0 Pro</th><td><span className="badge badge-warning badge-soft">Adapter not accepted</span></td><td>You are evaluating the implemented Alibaba adapter separately. It is not externally accepted or selected in the canonical environment.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Never infer the model from the site's name. Check <InternalLink path="/models" onNavigate={onNavigate}>Models</InternalLink> and the selector beside the prompt before spending credits.</p>
        <StepVisual step="02" title="Confirm the access surface" items={["Model name", "Provider", "Availability", "Prompt limit", "Cost and terms"]} />
      </section>

      <section className="article-section" aria-labelledby="select-ratio">
        <h2 id="select-ratio">Step 3 — Select Aspect Ratio</h2>
        <p>Choose a canvas that matches the final placement. Square works for grids and product cards; landscape suits dashboards, explainers, and storyboards; portrait suits posters, checklists, and mobile layouts.</p>
        <div className="ratio-guide">
          <span><b>1:1</b> grids and social cards</span>
          <span><b>16:9</b> dashboards and storyboards</span>
          <span><b>4:3</b> reports and product layouts</span>
          <span><b>9:16</b> posters and mobile screens</span>
        </div>
        <p>Alibaba Cloud's invite API documentation describes output image totals from 512×512 to 2048×2048 pixels and can recommend a size when none is supplied. The ratios offered by this site belong to its current selected model, not Qwen Image 3.</p>
        <StepVisual step="03" title="Match the canvas to the job" items={["Destination", "Reading distance", "Content density", "Crop safety"]} />
      </section>

      <section className="article-section" aria-labelledby="generate-review">
        <h2 id="generate-review">Step 4 — Generate and Review</h2>
        <p>Generate one candidate, then review it against the brief before asking for decorative changes. Start with structural correctness: count panels, check required objects, read every word, and trace the visual hierarchy.</p>
        <ul className="article-check-list">
          <li><Check size={16} />Every required string appears exactly once and is spelled correctly.</li>
          <li><Check size={16} />Numbers, formulas, dates, prices, and units match the source.</li>
          <li><Check size={16} />Panels remain distinct and nested interfaces keep the correct depth.</li>
          <li><Check size={16} />People, products, and reference objects stay internally consistent.</li>
          <li><Check size={16} />No invented logos, claims, citations, or decorative filler text appear.</li>
        </ul>
        <StepVisual step="04" title="Review before refining" items={["Text", "Facts", "Hierarchy", "Continuity", "Rights"]} />
      </section>

      <section className="article-section" aria-labelledby="download-use">
        <h2 id="download-use">Step 5 — Download and Use Your Image</h2>
        <p>Download only after the result passes your review. Keep the final prompt, model name, access surface, date, settings, reference-image provenance, and any edits beside the asset so the process can be reproduced or audited.</p>
        <p>For commercial work, review the terms attached to the official surface you used and the rights in every reference, logo, person, and text source. This site's billing plans are not a license statement for Qwen Image 3.</p>
        <StepVisual step="05" title="Save the evidence with the asset" items={["Final prompt", "Model and surface", "Date and settings", "Source rights", "Review notes"]} />
        <div className="card card-border article-inline-cta"><div className="card-body"><h3 className="card-title">Try the current workspace</h3><p>Uses the currently available model shown in the generator. Qwen Image 3 is not connected here.</p><div className="card-actions"><InternalLink className="btn" path="/" onNavigate={onNavigate}>Try it now <ArrowRight size={14} /></InternalLink></div></div></div>
      </section>

      <section className="article-section" aria-labelledby="pro-tips">
        <h2 id="pro-tips">Pro Tips for Better Results</h2>
        <ul className="article-check-list">
          <li><Check size={16} />Use labeled prompt sections when the brief contains multiple regions.</li>
          <li><Check size={16} />Quote exact strings and state their language, location, size, and priority.</li>
          <li><Check size={16} />Describe relationships—above, inside, aligned with—not only the objects.</li>
          <li><Check size={16} />Ask for one coherent visual system instead of many unrelated style names.</li>
          <li><Check size={16} />Revise the smallest failing section instead of rewriting the whole brief.</li>
          <li><Check size={16} />Separate official capability claims from what you have verified yourself.</li>
        </ul>
      </section>

      <section className="article-section" aria-labelledby="mistakes">
        <h2 id="mistakes">Common Mistakes to Avoid</h2>
        <div className="mistake-grid">
          <div><strong>Vague hierarchy</strong><span>“Make a poster” does not identify what readers should notice first.</span></div>
          <div><strong>Unquoted text</strong><span>Decorative copy can replace the words you actually need.</span></div>
          <div><strong>Conflicting styles</strong><span>Too many visual directions weaken consistency across panels.</span></div>
          <div><strong>No factual review</strong><span>Readable text can still be incorrect text.</span></div>
          <div><strong>Wrong model assumption</strong><span>A branded website name does not prove which provider handled a request.</span></div>
          <div><strong>Unlicensed references</strong><span>Generation does not remove third-party rights or usage restrictions.</span></div>
        </div>
      </section>

      <ArticleFaq document={document} id="how-to-faq" />
    </ArticleLayout>
  );
}

function PromptCard({
  example,
  onUsePrompt,
}: {
  example: PromptExample;
  onUsePrompt: (prompt: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const canPrefill = example.prompt.length <= 800;

  async function copyPrompt() {
    await navigator.clipboard.writeText(example.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="card card-border prompt-card">
      <div className="card-body">
        <div className="prompt-card-top">
          <span className="badge badge-outline">{example.aspectRatio}</span>
          <span>{example.useCase}</span>
        </div>
        <h3 className="card-title">{example.title}</h3>
        <pre><code>{example.prompt}</code></pre>
        <div className="prompt-check"><ScanText size={15} /><span><strong>Review:</strong> {example.check}</span></div>
        <div className="prompt-model-note">Curated example · Not independently tested on Qwen Image 3</div>
        <div className="card-actions">
          <button className="btn btn-sm" type="button" onClick={() => void copyPrompt()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy prompt"}</button>
          {canPrefill && <button className="btn btn-ghost btn-sm" type="button" onClick={() => onUsePrompt(example.prompt)}>Try this prompt <ArrowRight size={14} /></button>}
        </div>
        {canPrefill && <small>The handoff opens this site's current available model and does not auto-submit.</small>}
      </div>
    </article>
  );
}

function PromptsPage({ onNavigate, onUsePrompt }: ContentNavigateProps) {
  const document = contentDocumentForPath("/guides/best-prompts-for-qwen-image-3")!;
  const categoryIds: Record<PromptExample["category"], string> = {
    "Poster & Flyer": "poster-prompts",
    "UI & App Mockup": "ui-prompts",
    "Infographic & Data Visualization": "infographic-prompts",
    "Storyboard & Scene": "storyboard-prompts",
    "Product Photography": "product-prompts",
  };
  const categories = Object.keys(categoryIds) as PromptExample["category"][];
  const grouped = new Map(categories.map((category) => [
    category,
    promptExamples.filter((example) => example.category === category),
  ]));
  const toc = [
    ["poster-prompts", "Poster & Flyer Prompts"],
    ["ui-prompts", "UI & App Mockup Prompts"],
    ["infographic-prompts", "Infographic & Data Visualization Prompts"],
    ["storyboard-prompts", "Storyboard & Scene Prompts"],
    ["product-prompts", "Product Photography Prompts"],
    ["prompt-tips", "Tips for Writing Your Own Prompts"],
    ["prompts-faq", "FAQ"],
  ].map(([id, label]) => ({ id, label }));
  const related = [
    contentDocumentForPath("/guides/qwen-image-3-tutorial")!,
    contentDocumentForPath("/guides/how-to-generate-ai-images-with-qwen-image-3")!,
    contentDocumentForPath("/blog/qwen-image-3-vs-midjourney")!,
  ];

  return (
    <ArticleLayout document={document} toc={toc} related={related} onNavigate={onNavigate}>
      <div role="note" className="alert alert-info alert-soft article-evidence-note">
        <Clipboard size={19} />
        <span>These 50 original templates are curated from documented Qwen Image 3 capabilities. They are not labeled tested because this site does not have 50 prompt-level Qwen Image 3 results.</span>
      </div>

      {categories.map((category) => (
        <section className="article-section prompt-category" aria-labelledby={categoryIds[category]} key={category}>
          <h2 id={categoryIds[category]}>{category} Prompts</h2>
          <p>{category === "Poster & Flyer"
            ? "Use exact strings, hierarchy, and a defined grid for text-led campaign work."
            : category === "UI & App Mockup"
              ? "Describe navigation, data, states, and nesting so the result reads like a coherent product."
              : category === "Infographic & Data Visualization"
                ? "Specify information order, labels, relationships, and the checks that make a visual useful."
                : category === "Storyboard & Scene"
                  ? "Lock panel count, sequence, character or product continuity, and the note under every frame."
                  : "Define materials, geometry, label copy, lighting, and the details that prove the product is consistent."}</p>
          <div className="prompt-grid">
            {grouped.get(category)!.map((example) => <PromptCard example={example} onUsePrompt={onUsePrompt} key={example.id} />)}
          </div>
        </section>
      ))}

      <section className="article-section" aria-labelledby="prompt-tips">
        <h2 id="prompt-tips">Tips for Writing Your Own Prompts</h2>
        <div className="prompt-anatomy">
          <div><span>01</span><strong>Output</strong><p>Name the artifact and its intended canvas.</p></div>
          <div><span>02</span><strong>Hierarchy</strong><p>State what must be noticed first, second, and third.</p></div>
          <div><span>03</span><strong>Exact text</strong><p>Quote every required string and place it deliberately.</p></div>
          <div><span>04</span><strong>Regions</strong><p>Describe panels, nesting, alignment, spacing, and relationships.</p></div>
          <div><span>05</span><strong>Visual system</strong><p>Choose one coherent type, color, material, light, and image direction.</p></div>
          <div><span>06</span><strong>Review</strong><p>List the facts and visual conditions the result must pass.</p></div>
        </div>
        <p>Use the <InternalLink path="/guides/how-to-generate-ai-images-with-qwen-image-3" onNavigate={onNavigate}>step-by-step generation guide</InternalLink> to move from a template to a reviewed output.</p>
      </section>

      <ArticleFaq document={document} id="prompts-faq" />
    </ArticleLayout>
  );
}

function TutorialPage({ onNavigate }: ContentNavigateProps) {
  const document = contentDocumentForPath("/guides/qwen-image-3-tutorial")!;
  const toc = [
    ["tutorial-overview", "Qwen Image 3 Quick Overview"],
    ["tutorial-what", "What Is Qwen Image 3?"],
    ["tutorial-rich", "Rich Content: 4.5k-Token Prompts"],
    ["tutorial-detail", "Authentic Details: Text Down to About 10px"],
    ["tutorial-knowledge", "Deep Knowledge: 12 Languages and Complex Interfaces"],
    ["tutorial-access", "How to Access Qwen Image 3"],
    ["tutorial-structure", "How to Structure a Qwen Image 3 Prompt"],
    ["tutorial-editing", "Text-to-Image and Image Editing"],
    ["tutorial-use-cases", "Best Use Cases"],
    ["tutorial-limitations", "Limitations and Verification Notes"],
    ["tutorial-how-to", "Continue With the Step-by-Step Guide"],
    ["tutorial-prompts", "Explore 50+ Prompt Examples"],
    ["tutorial-comparison", "Qwen Image 3 vs Midjourney"],
    ["tutorial-faq", "FAQ"],
  ].map(([id, label]) => ({ id, label }));
  const related = [
    contentDocumentForPath("/guides/how-to-generate-ai-images-with-qwen-image-3")!,
    contentDocumentForPath("/guides/best-prompts-for-qwen-image-3")!,
    contentDocumentForPath("/blog/qwen-image-3-vs-midjourney")!,
  ];

  return (
    <ArticleLayout document={document} toc={toc} related={related} onNavigate={onNavigate}>
      <section className="article-section" aria-labelledby="tutorial-overview">
        <h2 id="tutorial-overview">Qwen Image 3 Quick Overview</h2>
        <p className="answer-first">Qwen Image 3 is built for images that need to carry substantial, structured information—not only a subject and a visual style.</p>
        <div className="article-metrics">
          <Metric value="4.5k" label="input-token target" />
          <Metric value="~10px" label="small-text target" />
          <Metric value="12" label="native languages" />
          <Metric value="1–3" label="reference images in the invite API" />
        </div>
        <p>Those numbers come from Qwen and Alibaba Cloud, not from an independent benchmark by this site. Qwen Image 3 is not connected to this site's generator.</p>
      </section>

      <section className="article-section" aria-labelledby="tutorial-what">
        <h2 id="tutorial-what">What Is Qwen Image 3?</h2>
        <p>Qwen-Image-3.0 is the third generation of Qwen's image foundation model. The July 21, 2026 launch describes a move from attractive images toward useful production artifacts, summarized as rich content, authentic details, and deep knowledge.</p>
        <p>The launch examples include educational boards, newspapers, formulas, nested interfaces, multilingual posters, product-like scenes, handwritten annotations, and restoration edits. These examples establish intended scope, but they do not guarantee perfect output for every prompt.</p>
      </section>

      <section className="article-section" aria-labelledby="tutorial-rich">
        <h2 id="tutorial-rich">Rich Content: 4.5k-Token Prompts</h2>
        <p>A long prompt is valuable only when it carries structure. Qwen's 4.5k-token claim allows one instruction to define multiple panels, exact copy, relationships, diagrams, and visual constraints without splitting the work into separate images.</p>
        <p>The official 3×3 example is important because each cell contains its own concept, text, illustrations, and layout. The practical lesson is to use labeled sections and repeat the rules that must remain consistent across panels.</p>
        <StepVisual step="A" title="Structure long briefs" items={["Canvas", "Global grid", "Panel-by-panel content", "Shared visual system", "Final checks"]} />
      </section>

      <section className="article-section" aria-labelledby="tutorial-detail">
        <h2 id="tutorial-detail">Authentic Details: Text Down to About 10px</h2>
        <p>The release describes small text around 10px and demonstrates formulas, annotations, newspapers, and labels. It also emphasizes realistic pores, hair, paper, glass, fabric, and other fine textures.</p>
        <p>Readable-looking text is not the same as correct text. A production workflow still needs source comparison, zoomed review, native-language review, and manual correction when one character or symbol matters.</p>
      </section>

      <section className="article-section" aria-labelledby="tutorial-knowledge">
        <h2 id="tutorial-knowledge">Deep Knowledge: 12 Languages and Complex Interfaces</h2>
        <p>Qwen states that Image 3 natively renders 12 languages and demonstrates Japanese, Korean, and Spanish. It also presents web pages, chat windows, livestream scenes, and other familiar interfaces arranged inside one another.</p>
        <p>World knowledge can make a first draft more useful, but it is not a cited database. Treat medical, legal, scientific, historical, and current-event content as unverified until checked against an authoritative source.</p>
      </section>

      <section className="article-section" aria-labelledby="tutorial-access">
        <h2 id="tutorial-access">How to Access Qwen Image 3</h2>
        <div className="access-paths">
          <div className="card card-border"><div className="card-body"><MousePointer2 /><h3 className="card-title">Qwen Chat</h3><p>The official launch links to Qwen Chat for an interactive path. Review the account, region, and usage terms shown there.</p><a className="btn btn-ghost btn-sm" href={QWEN_CHAT_URL} target="_blank" rel="noopener noreferrer">Open official chat <ExternalLink size={14} /></a></div></div>
          <div className="card card-border"><div className="card-body"><Layers3 /><h3 className="card-title">Alibaba Cloud API</h3><p>Model Studio documents qwen-image-3.0-pro for generation and editing, but currently describes access as invite-only.</p><a className="btn btn-ghost btn-sm" href={QWEN_IMAGE_3_API_URL} target="_blank" rel="noopener noreferrer">Read API reference <ExternalLink size={14} /></a></div></div>
          <div className="card card-border"><div className="card-body"><ShieldCheck /><h3 className="card-title">This independent site</h3><p>Not an Image 3 access path today. Use Models to see the exact currently configured provider before a request.</p><InternalLink className="btn btn-ghost btn-sm" path="/models" onNavigate={onNavigate}>View model status <ArrowRight size={14} /></InternalLink></div></div>
        </div>
      </section>

      <section className="article-section" aria-labelledby="tutorial-structure">
        <h2 id="tutorial-structure">How to Structure a Qwen Image 3 Prompt</h2>
        <div className="prompt-anatomy">
          <div><span>01</span><strong>Purpose</strong><p>Poster, dashboard, storyboard, product image, or editing result.</p></div>
          <div><span>02</span><strong>Canvas</strong><p>Aspect ratio, reading distance, margins, grid, and density.</p></div>
          <div><span>03</span><strong>Content</strong><p>Subjects, panels, exact text, data, labels, and relationships.</p></div>
          <div><span>04</span><strong>Direction</strong><p>Type, color, material, lighting, camera, and illustration system.</p></div>
          <div><span>05</span><strong>Constraints</strong><p>Things that must stay consistent and content that must not appear.</p></div>
          <div><span>06</span><strong>Verification</strong><p>The checklist that decides whether the output is usable.</p></div>
        </div>
      </section>

      <section className="article-section" aria-labelledby="tutorial-editing">
        <h2 id="tutorial-editing">Text-to-Image and Image Editing</h2>
        <p>For text-to-image, the brief defines the whole output. For editing, preserve what must remain unchanged, describe the intended transformation, and name the regions or details that may move.</p>
        <p>Alibaba Cloud's current reference accepts one to three input images. Qwen's release demonstrates handwritten-style annotation, detailed additions, and restoration of damaged artwork. Use only reference images you are authorized to process.</p>
        <div className="editing-flow"><span>Reference</span><ArrowRight /><span>Preserve</span><ArrowRight /><span>Change</span><ArrowRight /><span>Verify</span></div>
      </section>

      <section className="article-section" aria-labelledby="tutorial-use-cases">
        <h2 id="tutorial-use-cases">Best Use Cases</h2>
        <div className="use-case-grid">
          <div><FileText /><strong>Dense documents</strong><span>Reports, newspapers, exam sheets, slides, and learning boards.</span></div>
          <div><LayoutDashboard /><strong>Interface concepts</strong><span>Dashboards, mobile screens, nested tools, and livestream layouts.</span></div>
          <div><Languages /><strong>Multilingual visuals</strong><span>Posters, labels, product pages, and educational content.</span></div>
          <div><ImageIcon /><strong>Detailed scenes</strong><span>Products, materials, people, and information-led photography.</span></div>
          <div><Layers3 /><strong>Storyboards</strong><span>Multi-panel narratives with continuity and shot notes.</span></div>
          <div><WandSparkles /><strong>Editing</strong><span>Annotations, restoration, information overlays, and reference-led changes.</span></div>
        </div>
      </section>

      <section className="article-section" aria-labelledby="tutorial-limitations">
        <h2 id="tutorial-limitations">Limitations and Verification Notes</h2>
        <ul className="article-check-list">
          <li><Check size={16} />The official release is a capability showcase, not an independent benchmark.</li>
          <li><Check size={16} />Text can look convincing while containing a wrong character, number, or formula.</li>
          <li><Check size={16} />World knowledge may be outdated or incorrect and needs external sourcing.</li>
          <li><Check size={16} />The Alibaba API is invite-only and may vary by region, account, price, and data terms.</li>
          <li><Check size={16} />This site's Qwen Image 2 acceptance result cannot be used as Image 3 evidence.</li>
        </ul>
      </section>

      <section className="article-section article-link-section" aria-labelledby="tutorial-how-to">
        <h2 id="tutorial-how-to">Continue With the Step-by-Step Guide</h2>
        <p>Move from access selection to a complete brief, aspect ratio, review checklist, and documented download workflow.</p>
        <InternalLink className="btn" path="/guides/how-to-generate-ai-images-with-qwen-image-3" onNavigate={onNavigate}>Read the generation guide <ArrowRight size={14} /></InternalLink>
      </section>

      <section className="article-section article-link-section" aria-labelledby="tutorial-prompts">
        <h2 id="tutorial-prompts">Explore 50+ Prompt Examples</h2>
        <p>Copy original templates for posters, UI mockups, infographics, storyboards, and product photography, then adapt every exact string and review requirement.</p>
        <InternalLink className="btn" path="/guides/best-prompts-for-qwen-image-3" onNavigate={onNavigate}>Browse prompt examples <ArrowRight size={14} /></InternalLink>
      </section>

      <section className="article-section article-link-section" aria-labelledby="tutorial-comparison">
        <h2 id="tutorial-comparison">Qwen Image 3 vs Midjourney</h2>
        <p>Compare the systems by documented prompt style, on-image text, multilingual layout, editing, access, API policy, privacy, and price—without inventing a head-to-head quality score.</p>
        <InternalLink className="btn" path="/blog/qwen-image-3-vs-midjourney" onNavigate={onNavigate}>Read the full comparison <ArrowRight size={14} /></InternalLink>
      </section>

      <ArticleFaq document={document} id="tutorial-faq" />
    </ArticleLayout>
  );
}

export function GuidesHubPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const guides = contentDocumentsForKind("guide");
  return (
    <main className="content-page content-hub-page">
      <header className="content-page-intro">
        <div className="section-kicker">Guides</div>
        <h1>Qwen Image 3 guides for practical visual work.</h1>
        <p>Learn the official capabilities, build structured prompts, follow a reviewable generation workflow, and copy original examples without confusing model documentation with this site's current runtime.</p>
      </header>
      <div role="note" className="alert alert-warning alert-soft hub-status"><ShieldCheck size={19} /><span>Qwen Image 3 is officially announced but is not connected to this independent site's generator.</span></div>
      <div className="content-hub-grid">
        {guides.map((guide, index) => (
          <article className={`card card-border content-hub-card ${index === 0 ? "content-hub-featured" : ""}`} key={guide.path}>
            <div className="card-body">
              <span>{index === 0 ? "Start here" : guide.readTime}</span>
              <h2 className="card-title">{guide.h1}</h2>
              <p>{guide.excerpt}</p>
              <div className="card-actions"><InternalLink className="btn btn-ghost" path={guide.path} onNavigate={onNavigate}>Read guide <ArrowRight size={14} /></InternalLink></div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

export function BlogHubPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const posts = contentDocumentsForKind("blog");
  return (
    <main className="content-page content-hub-page">
      <header className="content-page-intro">
        <div className="section-kicker">Blog</div>
        <h1>Source-led Qwen Image 3 analysis.</h1>
        <p>Compare documented model capabilities, access, pricing, and workflow fit while keeping official claims, independent testing, and this site's provider status clearly separated.</p>
      </header>
      <div className="content-hub-grid">
        {posts.map((post) => (
          <article className="card card-border content-hub-card content-hub-featured" key={post.path}>
            <div className="card-body">
              <span>Model comparison · {post.readTime}</span>
              <h2 className="card-title">{post.h1}</h2>
              <p>{post.excerpt}</p>
              <div className="card-actions"><InternalLink className="btn" path={post.path} onNavigate={onNavigate}>Read comparison <ArrowRight size={14} /></InternalLink></div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

export function ContentArticlePage({ path, onNavigate, onUsePrompt }: { path: string } & ContentNavigateProps) {
  if (path === "/blog/qwen-image-3-vs-midjourney") return <ComparisonPage onNavigate={onNavigate} onUsePrompt={onUsePrompt} />;
  if (path === "/guides/how-to-generate-ai-images-with-qwen-image-3") return <HowToPage onNavigate={onNavigate} onUsePrompt={onUsePrompt} />;
  if (path === "/guides/best-prompts-for-qwen-image-3") return <PromptsPage onNavigate={onNavigate} onUsePrompt={onUsePrompt} />;
  if (path === "/guides/qwen-image-3-tutorial") return <TutorialPage onNavigate={onNavigate} onUsePrompt={onUsePrompt} />;
  return null;
}
