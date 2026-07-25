import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".xml"]);
const forbidden = [
  { label: "localhost", pattern: /\blocalhost\b/i },
  { label: "loopback address", pattern: /\b127\.0\.0\.1\b/ },
  { label: "SQLite customer copy", pattern: /\bSQLite\b/ },
  { label: "development auth token", pattern: /\bdevToken\b|\bdevelopment token\b|\blocal verification\b/i },
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const violations = [];
for (const file of await files(root)) {
  if (!textExtensions.has(extname(file))) continue;
  const content = await readFile(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) {
      violations.push(`${relative(root, file)}: ${rule.label}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Production artifact contains local-only content:\n${violations.join("\n")}`);
}

console.log("Production artifact contains no local endpoint, SQLite, or development-token copy.");
