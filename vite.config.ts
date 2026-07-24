import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderPrerenderedNotFound, renderPrerenderedRoute } from "./src/prerender";
import { PUBLIC_INDEXABLE_PATHS, renderSitemap, rewriteRouteDocumentMetadata } from "./src/seo";

const rootPattern = /<!--app-root-start--><div id="root">[\s\S]*?<\/div><!--app-root-end-->/;

function injectRoute(html: string, path: string, markup = renderPrerenderedRoute(path)) {
  if (!rootPattern.test(html)) {
    throw new Error("Prerender root markers are missing from index.html.");
  }
  const withMarkup = html.replace(
    rootPattern,
    `<!--app-root-start--><div id="root">${markup}</div><!--app-root-end-->`,
  );
  return rewriteRouteDocumentMetadata(withMarkup, path);
}

function outputFileName(path: string) {
  return `${path.replace(/^\/+/, "")}.html`;
}

function prerenderPublicRoutes(): Plugin {
  let outputDirectory = resolve(process.cwd(), "dist");

  return {
    name: "prerender-public-routes",
    enforce: "pre",
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return injectRoute(html, "/");
    },
    closeBundle() {
      const indexPath = resolve(outputDirectory, "index.html");
      const htmlTemplate = readFileSync(indexPath, "utf8");

      for (const path of PUBLIC_INDEXABLE_PATHS) {
        if (path === "/") continue;
        const fileName = outputFileName(path);
        const target = resolve(outputDirectory, fileName);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, injectRoute(htmlTemplate, path));
      }

      writeFileSync(
        resolve(outputDirectory, "404.html"),
        injectRoute(htmlTemplate, "/404", renderPrerenderedNotFound()),
      );
      writeFileSync(resolve(outputDirectory, "sitemap.xml"), renderSitemap());
    },
  };
}

export default defineConfig({
  plugins: [prerenderPublicRoutes(), react(), tailwindcss()],
});
