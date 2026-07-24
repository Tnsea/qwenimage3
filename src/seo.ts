import {
  contentDocumentForPath,
  homeFaqs,
  publishedContentDocuments,
  type ContentDocument,
} from "./content.js";

export const CANONICAL_SITE_ORIGIN = "https://qwen-image-3.net";

const CORE_PUBLIC_PATHS = [
  "/",
  "/examples",
  "/models",
  "/pricing",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/status",
  "/support",
  "/guides",
  "/blog",
  "/api",
] as const;

export const PUBLIC_INDEXABLE_PATHS: readonly string[] = [
  ...CORE_PUBLIC_PATHS,
  ...publishedContentDocuments.map((document) => document.path),
];

const publicIndexablePathSet = new Set<string>(PUBLIC_INDEXABLE_PATHS);

export interface PageSeo {
  title: string;
  description: string;
  ogImage: string;
  ogType: "website" | "article";
  robots: "index,follow" | "noindex,nofollow";
}

const corePageSeo: Record<(typeof CORE_PUBLIC_PATHS)[number], PageSeo> = {
  "/": {
    title: "Qwen Image 3 Generator Hub - Independent AI Image Workspace",
    description: "Qwen Image 3 Generator Hub is an independent AI image workspace with transparent model status, 20 welcome credits, and private results.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/examples": {
    title: "AI Image Examples and Prompt Ideas | Qwen Image 3 Generator Hub",
    description: "Explore curated image-generation examples and reusable prompt ideas for products, architecture, editorial scenes, food, fashion, and more.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/models": {
    title: "Qwen Image Model Status and Availability | Qwen Image 3 Generator Hub",
    description: "Review the exact image models, providers, prompt limits, aspect ratios, costs, and verification status available in this independent workspace.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/pricing": {
    title: "AI Image Generation Pricing and Credits | Qwen Image 3 Generator Hub",
    description: "Compare Starter, Creator, and Professional image-generation plans, account credits, renewal terms, and automatic credit recovery after failures.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/privacy": {
    title: "Privacy and Data Notice | Qwen Image 3 Generator Hub",
    description: "Read how this independent image-generation workspace handles accounts, prompts, private generated assets, analytics, providers, retention, and deletion.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/terms": {
    title: "Billing Terms | Qwen Image 3 Generator Hub",
    description: "Read the recurring-payment, credit, cancellation, renewal, tax, payment-review, and account-deletion terms that apply before a Stripe purchase.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/refund-policy": {
    title: "Refund Policy | Qwen Image 3 Generator Hub",
    description: "Review refund eligibility, subscription cancellation, unused credits, failed-generation corrections, disputes, and account handling for purchases.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/status": {
    title: "Independent Product and Model Status | Qwen Image 3 Generator Hub",
    description: "Check the current provider, model, deployment, billing, verification, and production-approval status of this independent image-generation product.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/support": {
    title: "Support and Security Guidance | Qwen Image 3 Generator Hub",
    description: "Find account, billing, generation, API, privacy, and security support guidance, then open a private ticket from Studio when signed in.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/guides": {
    title: "Qwen Image 3 Guides, Tutorial, and Prompt Examples",
    description: "Read practical Qwen Image 3 guides covering official capabilities, access, structured prompting, dense layouts, multilingual text, and prompt templates.",
    ogImage: "/qwen-image-3-tutorial-og.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/blog": {
    title: "Qwen Image 3 Blog and Model Comparisons",
    description: "Read source-led Qwen Image 3 analysis, model comparisons, official capability notes, access updates, and independent product-status disclosures.",
    ogImage: "/qwen-image-3-vs-midjourney-og.png",
    ogType: "website",
    robots: "index,follow",
  },
  "/api": {
    title: "Image Generation API Guide | Qwen Image 3 Generator Hub",
    description: "Learn the provider-aware generation API contract, scoped key model, idempotent requests, private results, and shared server-authoritative credit ledger.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website",
    robots: "index,follow",
  },
};

function normalizePath(pathname: string): string {
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

export function legacyPublicRedirectPath(pathname: string): string | null {
  return normalizePath(pathname) === "/prompts" ? "/examples" : null;
}

export function publicCanonicalPath(pathname: string): string | null {
  const normalizedPath = normalizePath(pathname);
  return publicIndexablePathSet.has(normalizedPath) ? normalizedPath : null;
}

export function publicCanonicalUrl(pathname: string, siteOrigin = CANONICAL_SITE_ORIGIN): string | null {
  const canonicalPath = publicCanonicalPath(pathname);
  if (!canonicalPath) return null;
  return new URL(canonicalPath, `${siteOrigin.replace(/\/+$/, "")}/`).toString();
}

export function pageSeoForPath(pathname: string): PageSeo | null {
  const normalizedPath = normalizePath(pathname);
  const document = contentDocumentForPath(normalizedPath);
  if (document?.status === "published") {
    return {
      title: document.title,
      description: document.description,
      ogImage: document.ogImage,
      ogType: document.kind === "blog" ? "article" : "article",
      robots: "index,follow",
    };
  }
  return corePageSeo[normalizedPath as keyof typeof corePageSeo] ?? null;
}

function absoluteUrl(pathname: string, siteOrigin = CANONICAL_SITE_ORIGIN): string {
  return new URL(pathname, `${siteOrigin.replace(/\/+$/, "")}/`).toString();
}

function faqEntity(faqs: Array<{ question: string; answer: string }>) {
  return faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  }));
}

function breadcrumbEntity(document: ContentDocument, siteOrigin: string) {
  const sectionPath = document.kind === "blog" ? "/blog" : "/guides";
  const sectionName = document.kind === "blog" ? "Blog" : "Guides";
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(document.path, siteOrigin)}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteUrl("/", siteOrigin),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: sectionName,
        item: absoluteUrl(sectionPath, siteOrigin),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: document.h1,
        item: absoluteUrl(document.path, siteOrigin),
      },
    ],
  };
}

export function structuredDataForPath(pathname: string, siteOrigin = CANONICAL_SITE_ORIGIN): Record<string, unknown> {
  const normalizedPath = publicCanonicalPath(pathname);
  if (!normalizedPath) return { "@context": "https://schema.org", "@graph": [] };
  const pageSeo = pageSeoForPath(normalizedPath) ?? corePageSeo["/"];
  const pageUrl = absoluteUrl(normalizedPath, siteOrigin);
  const imageUrl = absoluteUrl(pageSeo.ogImage, siteOrigin);
  const organizationId = `${absoluteUrl("/", siteOrigin)}#organization`;
  const websiteId = `${absoluteUrl("/", siteOrigin)}#website`;
  const webpageId = `${pageUrl}#webpage`;
  const document = contentDocumentForPath(normalizedPath);

  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "Qwen Image 3 Generator Hub",
      url: absoluteUrl("/", siteOrigin),
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/favicon.png", siteOrigin),
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "Qwen Image 3 Generator Hub",
      url: absoluteUrl("/", siteOrigin),
      inLanguage: "en",
      publisher: { "@id": organizationId },
    },
    {
      "@type": "WebPage",
      "@id": webpageId,
      name: pageSeo.title,
      description: pageSeo.description,
      url: pageUrl,
      inLanguage: "en",
      isPartOf: { "@id": websiteId },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: imageUrl,
        width: 1200,
        height: 630,
      },
    },
  ];

  if (normalizedPath === "/") {
    graph[2].mainEntity = { "@id": `${absoluteUrl("/", siteOrigin)}#faq` };
    graph.push(
      {
        "@type": "WebApplication",
        "@id": `${absoluteUrl("/", siteOrigin)}#app`,
        url: absoluteUrl("/", siteOrigin),
        name: "Qwen Image 3 Generator Hub",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires JavaScript for image generation",
        description: "An account-based private image workflow with transparent runtime selection, multiple aspect ratios, visual styles, quality levels, projects, and downloads.",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "FAQPage",
        "@id": `${absoluteUrl("/", siteOrigin)}#faq`,
        url: absoluteUrl("/", siteOrigin),
        isPartOf: { "@id": webpageId },
        mainEntity: faqEntity(homeFaqs),
      },
    );
  } else if (document?.status === "published") {
    const faqId = `${pageUrl}#faq`;
    graph[2].mainEntity = { "@id": faqId };
    graph.push(
      {
        "@type": document.kind === "blog" ? "BlogPosting" : "Article",
        "@id": `${pageUrl}#article`,
        headline: document.h1,
        description: document.description,
        url: pageUrl,
        mainEntityOfPage: { "@id": webpageId },
        image: imageUrl,
        datePublished: document.publishedAt,
        dateModified: document.updatedAt,
        inLanguage: "en",
        author: { "@id": organizationId },
        publisher: { "@id": organizationId },
      },
      breadcrumbEntity(document, siteOrigin),
      {
        "@type": "FAQPage",
        "@id": faqId,
        url: pageUrl,
        isPartOf: { "@id": webpageId },
        mainEntity: faqEntity(document.faqs),
      },
    );
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function serializeStructuredData(pathname: string, siteOrigin = CANONICAL_SITE_ORIGIN): string {
  return JSON.stringify(structuredDataForPath(pathname, siteOrigin)).replace(/</g, "\\u003c");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceMetaContent(html: string, selector: string, value: string): string {
  const escaped = escapeHtmlAttribute(value);
  return html.replace(
    new RegExp(`(<meta\\s+${selector}\\s+content=["'])[^"']*(["'][^>]*>)`, "i"),
    (_match, prefix: string, suffix: string) => `${prefix}${escaped}${suffix}`,
  );
}

export function rewritePublicCanonicalMetadata(html: string, canonicalUrl: string): string {
  return html
    .replace(
      /(<link\s+rel=["']canonical["']\s+href=["'])[^"']*(["'][^>]*>)/i,
      (_match, prefix: string, suffix: string) => `${prefix}${canonicalUrl}${suffix}`,
    )
    .replace(
      /(<meta\s+property=["']og:url["']\s+content=["'])[^"']*(["'][^>]*>)/i,
      (_match, prefix: string, suffix: string) => `${prefix}${canonicalUrl}${suffix}`,
    );
}

export function rewriteRouteDocumentMetadata(
  html: string,
  pathname: string,
  siteOrigin = CANONICAL_SITE_ORIGIN,
): string {
  const pageSeo = pageSeoForPath(pathname) ?? {
    title: "Page Not Found | Qwen Image 3 Generator Hub",
    description: "The requested page does not exist.",
    ogImage: "/qwen-image-3-workflow.png",
    ogType: "website" as const,
    robots: "noindex,nofollow" as const,
  };
  const canonicalUrl = publicCanonicalUrl(pathname, siteOrigin) ?? absoluteUrl(normalizePath(pathname), siteOrigin);
  const imageUrl = absoluteUrl(pageSeo.ogImage, siteOrigin);
  let output = html
    .replace(/<title>[^<]*<\/title>/i, `<title>${pageSeo.title}</title>`);
  output = replaceMetaContent(output, `name=["']description["']`, pageSeo.description);
  output = replaceMetaContent(output, `name=["']robots["']`, pageSeo.robots);
  output = replaceMetaContent(output, `property=["']og:type["']`, pageSeo.ogType);
  output = replaceMetaContent(output, `property=["']og:title["']`, pageSeo.title);
  output = replaceMetaContent(output, `property=["']og:description["']`, pageSeo.description);
  output = replaceMetaContent(output, `property=["']og:image["']`, imageUrl);
  output = replaceMetaContent(output, `name=["']twitter:title["']`, pageSeo.title);
  output = replaceMetaContent(output, `name=["']twitter:description["']`, pageSeo.description);
  output = replaceMetaContent(output, `name=["']twitter:image["']`, imageUrl);
  output = rewritePublicCanonicalMetadata(output, canonicalUrl);
  output = output.replace(
    /(<script\s+id=["']seo-structured-data["']\s+type=["']application\/ld\+json["']>)[\s\S]*?(<\/script>)/i,
    `$1${serializeStructuredData(pathname, siteOrigin)}$2`,
  );
  return output;
}

const sitemapPriority: Record<string, { changefreq: "weekly" | "monthly" | "yearly"; priority: string }> = {
  "/": { changefreq: "weekly", priority: "1.0" },
  "/examples": { changefreq: "monthly", priority: "0.8" },
  "/models": { changefreq: "weekly", priority: "0.9" },
  "/pricing": { changefreq: "monthly", priority: "0.7" },
  "/privacy": { changefreq: "yearly", priority: "0.5" },
  "/terms": { changefreq: "yearly", priority: "0.5" },
  "/refund-policy": { changefreq: "yearly", priority: "0.5" },
  "/status": { changefreq: "weekly", priority: "0.6" },
  "/support": { changefreq: "monthly", priority: "0.5" },
  "/guides": { changefreq: "weekly", priority: "0.9" },
  "/blog": { changefreq: "weekly", priority: "0.8" },
  "/api": { changefreq: "monthly", priority: "0.6" },
};

export function renderSitemap(siteOrigin = CANONICAL_SITE_ORIGIN): string {
  const urls = PUBLIC_INDEXABLE_PATHS.map((path) => {
    const defaults = path.startsWith("/guides/") || path.startsWith("/blog/")
      ? { changefreq: "monthly" as const, priority: "0.8" }
      : sitemapPriority[path] ?? { changefreq: "monthly" as const, priority: "0.5" };
    const document = contentDocumentForPath(path);
    const lastmod = document ? `\n    <lastmod>${document.updatedAt}</lastmod>` : "";
    return `  <url>
    <loc>${absoluteUrl(path, siteOrigin)}</loc>${lastmod}
    <changefreq>${defaults.changefreq}</changefreq>
    <priority>${defaults.priority}</priority>
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function isKnownClientRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return publicIndexablePathSet.has(normalized)
    || normalized === "/verify-email"
    || normalized === "/reset-password"
    || normalized === "/studio"
    || normalized.startsWith("/studio/");
}
