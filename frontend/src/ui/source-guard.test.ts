import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(__dirname, "..");

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "fonts") continue;
      out.push(...collect(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const PALETTE_RE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret)-(?:gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d+)?\b/;

type Rule = { name: string; re: RegExp; appliesTo?: RegExp };

const RULES: Rule[] = [
  {
    name: "named Tailwind palette class",
    re: PALETTE_RE,
  },
  { name: "gradient", re: /gradient/i },
  { name: "shadow utility", re: /\bshadow(?:-[a-z0-9]+)?\b/, appliesTo: /\.tsx?$/ },
  { name: "box-shadow", re: /box-shadow/, appliesTo: /\.css$/ },
  { name: "dark: variant", re: /\bdark:/ },
  { name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/ },
  { name: "Retry action", re: /\bRetry\b/ },
  { name: "emoji", re: /\p{Extended_Pictographic}/u },
  { name: "Google fonts", re: /next\/font\/google|fonts\.googleapis/ },
];

describe("frontend source guard", () => {
  const files = collect(SRC_ROOT);

  it("allows spec tokens (slate) but still rejects named palette classes", () => {
    expect(PALETTE_RE.test("bg-slate-tint text-slate")).toBe(false);
    expect(PALETTE_RE.test("bg-gray-200")).toBe(true);
  });

  it("scans source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains no forbidden styling or content patterns", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const rule of RULES) {
          if (rule.appliesTo && !rule.appliesTo.test(file)) continue;
          if (rule.re.test(line)) hits.push(`${file.slice(SRC_ROOT.length + 1)}:${i + 1} [${rule.name}] ${line.trim()}`);
        }
      });
    }
    expect(hits, `Forbidden patterns:\n${hits.join("\n")}`).toEqual([]);
  });
});
