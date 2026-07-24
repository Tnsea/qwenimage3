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
      ["Image models", "/models"],
      ["Guides", "/guides"],
      ["API guide", "/api"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["Privacy & data", "/privacy"],
      ["Billing terms", "/terms"],
      ["Refund policy", "/refund-policy"],
      ["Independent status", "/status"],
      ["Contact support", "/support"],
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

        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
          role="group"
          aria-label="Featured listings"
        >
          <a
            className="inline-flex rounded-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-base-content"
            href="https://startupfa.me/s/qwen-image-3-2?utm_source=qwen-image-3.net"
            target="_blank"
            rel="noopener noreferrer"
          >
            {/* Startup Fame supplies the branded alt text shown in its embed code. */}
            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
            <img
              src="https://startupfa.me/badges/featured-badge-small.webp"
              alt="Qwen Image Generator - Featured on Startup Fame"
              width={224}
              height={36}
              decoding="async"
            />
          </a>
          <a
            className="inline-flex rounded-sm transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-base-content"
            href="https://findly.tools/https-qwen-image-3-net?utm_source=https-qwen-image-3-net"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="https://findly.tools/badges/findly-tools-badge-light.svg"
              alt="Featured on Findly.tools"
              width={150}
              height={47}
              decoding="async"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
