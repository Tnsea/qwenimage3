import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("successful web generations open the private Studio history without inline result galleries", () => {
  const generator = readFileSync(new URL("../src/components/GeneratorWorkspace.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const studio = readFileSync(new URL("../src/components/Studio.tsx", import.meta.url), "utf8");

  assert.match(generator, /onGenerationCreated\(created\)/);
  assert.doesNotMatch(generator, /creation-output|creation-result-stage|creation-recent/);
  assert.doesNotMatch(generator, /\/api\/generations\?limit=/);
  assert.match(app, /onGenerationCreated=\{\(\) => navigate\("\/studio\/history"\)\}/);
  assert.match(studio, /onGenerationCreated=\{\(generation\) => \{ setGenerations\([\s\S]*onNavigate\("\/studio\/history"\); \}\}/);
});

test("Studio history keeps every generation action after the handoff", () => {
  const studio = readFileSync(new URL("../src/components/Studio.tsx", import.meta.url), "utf8");

  assert.match(studio, /href=\{generation\.downloadUrl\} download aria-label="Download generation"/);
  assert.match(studio, /\/api\/generations\/\$\{generation\.id\}\/favorite/);
  assert.match(studio, /Create variation/);
  assert.match(studio, /Retry generation/);
  assert.match(studio, /\/api\/generations\/\$\{generation\.id\}.*method: "DELETE"/s);
  assert.match(studio, /Delete this generation and its private image permanently/);
});

test("Studio inherits the selected product theme and exposes an in-workspace theme control", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const studio = readFileSync(new URL("../src/components/Studio.tsx", import.meta.url), "utf8");
  const workspaceStyles = readFileSync(new URL("../src/styles/workspace.css", import.meta.url), "utf8");

  assert.match(app, /<Studio[\s\S]*theme=\{theme\}[\s\S]*onTheme=\{\(\) => setTheme/);
  assert.match(studio, /data-theme=\{theme === "dark" \? "qwen" : "qwen-light"\}/);
  assert.match(studio, /Switch Studio to light theme/);
  assert.match(studio, /Switch Studio to dark theme/);
  assert.match(workspaceStyles, /\.settings-verification\.alert\s*\{[\s\S]*grid-auto-flow:\s*row;[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(workspaceStyles, /\.settings-verification-actions \.btn\s*\{[\s\S]*width:\s*100%;/);
});
