export const CANONICAL_SITE_ORIGIN = "https://qwen-image-3.net";

export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/examples",
  "/prompts",
  "/models",
  "/pricing",
  "/terms",
  "/refund-policy",
  "/guides",
  "/api",
] as const;

const publicIndexablePathSet = new Set<string>(PUBLIC_INDEXABLE_PATHS);

export function publicCanonicalPath(pathname: string): string | null {
  const normalizedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  return publicIndexablePathSet.has(normalizedPath) ? normalizedPath : null;
}

export function publicCanonicalUrl(pathname: string, siteOrigin = CANONICAL_SITE_ORIGIN): string | null {
  const canonicalPath = publicCanonicalPath(pathname);
  if (!canonicalPath) return null;
  return new URL(canonicalPath, `${siteOrigin.replace(/\/+$/, "")}/`).toString();
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
