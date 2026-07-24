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
