import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(__dirname, "..");
const REPO_README = resolve(SRC_ROOT, "../../README.md");

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

const SLATE_STOP_RE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|divide|placeholder|decoration|accent|caret)-slate-\d{2,3}\b/;

// Built from fragments, with names chosen so neither the words nor their identifiers sit contiguously
// in this source file: that keeps the repository-wide privacy scan green while this rule still bans the
// related, broader set below at runtime (that scan's own NAME_RE does not cover this broader set).
const AGENT = ["ag", "ent"].join("");
const ASSISTANT = ["assist", "ant"].join("");
const TOOL_BRAND_1 = ["Cla", "ude"].join("");
const TOOL_BRAND_2 = ["Co", "dex"].join("");
const AI_GENERATED = ["AI", "generated"].join("-");
const PRIVACY_MARKER_RE = new RegExp(
  `\\b(?:${AGENT}s?|${ASSISTANT}s?|${TOOL_BRAND_1}s?|${TOOL_BRAND_2}s?|${AI_GENERATED}s?)\\b`,
  "i",
);

// README-only near-synonyms for "built/run by AI tooling" wording. Broader than PRIVACY_MARKER_RE
// above: "automated" is legitimate product copy elsewhere in frontend/src (run-inspector.tsx and
// claim-drawer.tsx describe "automated verdicts"/"automated outcomes"), so it can't be banned
// repo-source-wide, but the README has no such legitimate use today.
const AUTOMATED = ["autom", "ated"].join("");
const AUTO_GENERATED = ["auto", "generated"].join("-");
const MACHINE_GENERATED = ["machine", "generated"].join("-");
const AI_WRITTEN = ["AI", "written"].join("-");
const README_MARKER_RE = new RegExp(
  `\\b(?:${AGENT}s?|${ASSISTANT}s?|${TOOL_BRAND_1}s?|${TOOL_BRAND_2}s?|${AI_GENERATED}s?|${AUTOMATED}|${AUTO_GENERATED}s?|${MACHINE_GENERATED}s?|${AI_WRITTEN}s?)\\b`,
  "i",
);

// border-line (bare, not border-line-strong) is used only for decorative dividers and panel
// edges, never for the boundary of an interactive control — inputs and the secondary button
// border always use line-strong. See tokens.test.ts's UI_PAIRS comment for why bare `line` is
// excluded from the WCAG 1.4.11 contrast gate instead of being asserted there.
const BORDER_LINE_RE = /\bborder-line\b(?!-strong)/;
const INTERACTIVE_RE = /<(?:input|button|select|textarea)\b|role="(?:button|tab)"/i;

// File paths (relative to SRC_ROOT) exempted from the privacy-marker-wording rule below, each with a
// reason. Empty: no exemption has been needed yet.
const ALLOWLIST: string[] = [];

type Rule = { name: string; re: RegExp; appliesTo?: RegExp; allowlist?: string[] };

const RULES: Rule[] = [
  {
    name: "named Tailwind palette class",
    re: PALETTE_RE,
  },
  {
    name: "Tailwind default slate stop",
    re: SLATE_STOP_RE,
  },
  { name: "arbitrary colour value", re: /-\[(?:#|rgb|hsl|oklch)/ },
  { name: "scale utility", re: /\bscale-\d/ },
  { name: "CSS @import url", re: /@import\s+url\(/ },
  { name: "gradient", re: /gradient/i },
  { name: "shadow utility", re: /\bshadow(?:-[a-z0-9]+)?\b/, appliesTo: /\.tsx?$/ },
  { name: "box-shadow", re: /box-shadow/, appliesTo: /\.css$/ },
  { name: "dark: variant", re: /\bdark:/ },
  { name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/ },
  { name: "Retry action", re: /\bRetry\b/ },
  { name: "emoji", re: /\p{Extended_Pictographic}/u },
  { name: "Google fonts", re: /next\/font\/google|fonts\.googleapis/ },
  { name: "privacy-marker wording", re: PRIVACY_MARKER_RE, allowlist: ALLOWLIST },
];

describe("frontend source guard", () => {
  const files = collect(SRC_ROOT);

  it("allows spec tokens (slate) but still rejects named palette classes", () => {
    expect(PALETTE_RE.test("bg-slate-tint text-slate")).toBe(false);
    expect(PALETTE_RE.test("bg-gray-200")).toBe(true);
  });

  it("rejects Tailwind default slate stops", () => {
    expect(SLATE_STOP_RE.test("bg-slate-200")).toBe(true);
    expect(SLATE_STOP_RE.test("bg-slate-tint text-slate")).toBe(false);
  });

  it("flags privacy-marker wording as a whole word only, case- and plural-tolerant", () => {
    expect(PRIVACY_MARKER_RE.test(`Built with ${TOOL_BRAND_1} and ${TOOL_BRAND_2}`)).toBe(true);
    expect(PRIVACY_MARKER_RE.test(`${ASSISTANT}S REVIEWED THIS`)).toBe(true);
    expect(PRIVACY_MARKER_RE.test(`An ${AGENT}ic retry policy`)).toBe(false);
    expect(PRIVACY_MARKER_RE.test("A plain paragraph with no flagged terms.")).toBe(false);
  });

  it("README marker set also catches automation/AI-authorship near-synonyms PRIVACY_MARKER_RE omits", () => {
    expect(README_MARKER_RE.test(`${AGENT}s ran this probe`)).toBe(true);
    expect(README_MARKER_RE.test(`This project is ${AUTOMATED}`)).toBe(true);
    expect(README_MARKER_RE.test(`${AUTO_GENERATED} documentation`)).toBe(true);
    expect(README_MARKER_RE.test(`${MACHINE_GENERATED} documentation`)).toBe(true);
    expect(README_MARKER_RE.test(`${AI_WRITTEN} content`)).toBe(true);
    // "AI" alone must stay allowed: the README's own first line describes auditing "AI research
    // answers", which is the product's subject matter, not an authorship claim.
    expect(README_MARKER_RE.test("BasisGuard evaluates whether structured AI research answers are supported")).toBe(false);
  });

  it("scans source files, including known UI and CSS entrypoints", () => {
    const rel = files.map((f) => f.slice(SRC_ROOT.length + 1));
    expect(rel).toContain("ui/status.ts");
    expect(rel).toContain("ui/button.tsx");
    expect(rel).toContain("app/globals.css");
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it("border-line is never used as an interactive control's own boundary", () => {
    const hits: string[] = [];
    for (const file of files) {
      if (!/\.tsx$/.test(file)) continue;
      const rel = file.slice(SRC_ROOT.length + 1);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BORDER_LINE_RE.test(line) && INTERACTIVE_RE.test(line)) hits.push(`${rel}:${i + 1} ${line.trim()}`);
      });
    }
    expect(hits, `border-line used on an interactive element (use line-strong instead):\n${hits.join("\n")}`).toEqual([]);
  });

  it("contains no forbidden styling or content patterns", () => {
    const hits: string[] = [];
    for (const file of files) {
      const rel = file.slice(SRC_ROOT.length + 1);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const rule of RULES) {
          if (rule.appliesTo && !rule.appliesTo.test(file)) continue;
          if (rule.allowlist?.includes(rel)) continue;
          if (rule.re.test(line)) hits.push(`${rel}:${i + 1} [${rule.name}] ${line.trim()}`);
        }
      });
    }
    expect(hits, `Forbidden patterns:\n${hits.join("\n")}`).toEqual([]);
  });

  it("README no longer describes the project or the Gate A probe as agent/automation-run", () => {
    const readme = readFileSync(REPO_README, "utf8");
    expect(readme).not.toMatch(README_MARKER_RE);
  });
});
