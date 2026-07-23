import type { MouseEvent } from "react";

interface SiteFooterProps {
  onNavigate: (path: string) => void;
}

const footerGroups = [
  {
    title: "Product",
    links: [
      ["Generator", "/"],
      ["Examples", "/examples"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Explore",
    links: [
      ["Prompt library", "/prompts"],
      ["Image models", "/models"],
      ["Guides", "/guides"],
      ["API guide", "/api"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["Privacy & data", "/#faq-privacy"],
      ["Billing terms", "/terms"],
      ["Refund policy", "/refund-policy"],
      ["Independent status", "/#faq-independent-product"],
      ["Contact support", "/studio/support"],
    ],
  },
] as const;

export function SiteFooter({ onNavigate }: SiteFooterProps) {
  function followLink(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const destination = new URL(href, window.location.origin);
    if (destination.origin !== window.location.origin) return;

    event.preventDefault();
    onNavigate(destination.pathname);

    if (destination.hash) {
      window.history.replaceState({}, "", `${destination.pathname}${destination.hash}`);
      window.setTimeout(() => {
        const target = document.querySelector(destination.hash);
        if (target instanceof HTMLDetailsElement) target.open = true;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  }

  return (
    <footer className="site-footer footer footer-vertical" aria-label="Site footer">
      <div className="site-footer-inner">
        <div className="site-footer-lead">
          <p>Describe it. Generate it. Keep it private.</p>
          <span>Independent image generation with clear model status and private-by-default results.</span>
        </div>

        <div className="site-footer-nav">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={`${group.title} links`}>
              <h2 className="footer-title">{group.title}</h2>
              {group.links.map(([label, href]) => (
                <a className="link link-hover" href={href} key={label} onClick={(event) => followLink(event, href)}>{label}</a>
              ))}
            </nav>
          ))}
        </div>

        <div className="site-footer-meta">
          <span>© {new Date().getUTCFullYear()} Qwen Image 3 Generator Hub. All rights reserved.</span>
          <span className="site-footer-language" aria-label="Site language">English</span>
        </div>
      </div>
    </footer>
  );
}
