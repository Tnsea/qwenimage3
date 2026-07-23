import { ShieldCheck, Sparkles } from "lucide-react";

export function HomeHero() {
  return (
    <section className="hero-section hero" aria-labelledby="page-title">
      <div className="hero-content">
        <div className="release-pill">
          <Sparkles size={14} aria-hidden="true" />
          <span>20 welcome credits · Account required</span>
        </div>
        <h1 id="page-title">
          Qwen Image 3{" "}
          <span>AI Image Generator Hub</span>
        </h1>
        <p className="hero-copy">
          Describe what you want, choose an aspect ratio, visual style, and quality, then generate.
          Create an account to receive 20 welcome credits, then use credits for every private generation.
        </p>
        <p className="trust-copy">
          <ShieldCheck size={15} aria-hidden="true" />
          Independent third-party product. Not affiliated with or endorsed by Alibaba or the Qwen team.
        </p>
      </div>
    </section>
  );
}
