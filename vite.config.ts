import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { renderPrerenderedHome } from "./src/prerender";

function prerenderHomepage(): Plugin {
  return {
    name: "prerender-homepage",
    enforce: "pre",
    transformIndexHtml(html) {
      const marker = '<div id="root"></div>';
      if (!html.includes(marker)) {
        throw new Error("Homepage prerender marker is missing from index.html.");
      }
      return html.replace(marker, `<div id="root">${renderPrerenderedHome()}</div>`);
    },
  };
}

export default defineConfig({
  plugins: [prerenderHomepage(), react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
