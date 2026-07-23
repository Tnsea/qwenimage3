import { ShieldCheck, Sparkles } from "lucide-react";

export function HomeHero() {
  return (
    <section className="hero-section hero" aria-labelledby="page-title">
      <div className="hero-content">
        <div className="release-pill">
          <Sparkles size={14} aria-hidden="true" />
          <span>Independent Qwen Image 3 guide · Current provider shown before generation</span>
        </div>
        <h1 id="page-title">
          Qwen Image 3
          <span>Prompt Guide &amp; Generator</span>
        </h1>
        <p className="hero-copy">
          Explore Qwen Image 3 prompt techniques, model-readiness updates, and a private AI image workflow.
          Create with the provider currently configured on this site; Qwen Image 3 itself is not presented as
          verified or available here.
        </p>
        <div className="hero-benefits" aria-label="Product benefits">
          <span>3 free generations daily</span>
          <span>Watermarked free exports</span>
          <span>Provider status before generation</span>
        </div>
        <p className="trust-copy">
          <ShieldCheck size={15} aria-hidden="true" />
          Independent third-party product. Not affiliated with or endorsed by Alibaba or the Qwen team.
        </p>
      </div>
    </section>
  );
}
