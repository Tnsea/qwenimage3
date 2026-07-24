import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("authentication dialog exposes only Google OAuth", () => {
  const dialog = readFileSync(new URL("../src/components/AuthDialog.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(dialog, /Continue with Google/);
  assert.match(dialog, /\/api\/auth\/oauth\/google\/start/);
  assert.doesNotMatch(dialog, /type="email"/);
  assert.doesNotMatch(dialog, /type="password"/);
  assert.doesNotMatch(dialog, /\/api\/auth\/(?:login|register|password-reset)/);
  assert.doesNotMatch(dialog, /\/api\/auth\/oauth\/github\/start/);
  assert.doesNotMatch(app, /use email and password/);
});
