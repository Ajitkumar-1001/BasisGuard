import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The CSS is the single source of truth: every value below is parsed out of globals.css, never
// copied in as a literal hex.
const CSS_PATH = resolve(__dirname, "../app/globals.css");
const css = readFileSync(CSS_PATH, "utf8");

function extractColors(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--color-([a-z][a-z0-9-]*):\s*(#[0-9A-Fa-f]{6})\s*;/g;
  for (const m of block.matchAll(re)) out[m[1]!] = m[2]!.toUpperCase();
  return out;
}

const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\}/)?.[1];
const darkBlock = css.match(
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/,
)?.[1];
if (!themeBlock) throw new Error("globals.css: no @theme block found");
if (!darkBlock) throw new Error("globals.css: no dark @media (prefers-color-scheme) :root block found");

const LIGHT = extractColors(themeBlock);
const DARK = extractColors(darkBlock);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexToRgb(hexA));
  const b = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

type Pair = [fg: string, bg: string];

// Every text/background pair the UI actually renders (grepped across frontend/src: status.ts
// TONE_CLASSES, button.tsx VARIANTS, banners/states/hash-chip/nav-link/run-header/new-run-form/
// run-view), each needing >= 4.5:1.
const TEXT_PAIRS: Pair[] = [
  ["ink", "canvas"], // page.tsx headings directly on the page background
  ["ink", "panel"], // card/dialog body text
  ["ink", "sunken"], // hash-chip, run-inspector raw blocks, claim-drawer quote blocks
  ["ink", "petrol-tint"], // table row / claims-table focus hover background
  ["ink-muted", "canvas"],
  ["ink-muted", "panel"],
  ["ink-muted", "sunken"],
  ["ink-muted", "petrol-tint"],
  ["petrol", "canvas"], // skip-link focus state
  ["petrol", "panel"], // citation/source links, nav wordmark hover
  ["petrol", "petrol-tint"], // active nav link
  ["petrol-hover", "canvas"],
  ["petrol-hover", "panel"], // link hover state
  ["petrol-hover", "petrol-tint"], // link hover inside a hovered table row
  ["panel", "petrol"], // primary button text on its fill
  ["panel", "petrol-hover"], // primary button text on its hover fill
  ["moss", "moss-tint"], // status tone: complete / supported / succeeded
  ["ochre", "ochre-tint"], // status tone: insufficient evidence / budget exhausted
  ["brick", "brick-tint"], // status tone: failed / contradicted
  ["plum", "plum-tint"], // status tone: needs review / verification failed
  ["slate", "slate-tint"], // status tone: queued / unverified / local-only
  ["brick", "panel"], // plain error text (new-run-form, run-view, ErrorState)
  ["moss", "panel"], // hash-chip "Copied" feedback
];

// UI-component (non-text) pairs the UI relies on, needing >= 3:1.
const UI_PAIRS: Pair[] = [
  ["line-strong", "panel"], // input border, secondary-button border
  ["petrol", "canvas"], // global :focus-visible ring
  ["petrol", "panel"],
  ["petrol", "sunken"],
];

describe("design token contrast (WCAG)", () => {
  it("globals.css defines a dark counterpart for every light token", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it("contrastRatio is correct on known values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
  });

  for (const [theme, tokens] of [
    ["light", LIGHT],
    ["dark", DARK],
  ] as const) {
    describe(`${theme} theme`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        it(`text ${fg} on ${bg} is >= 4.5:1`, () => {
          const ratio = contrastRatio(tokens[fg]!, tokens[bg]!);
          expect(
            ratio,
            `${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
      for (const [fg, bg] of UI_PAIRS) {
        it(`UI component ${fg} on ${bg} is >= 3:1`, () => {
          const ratio = contrastRatio(tokens[fg]!, tokens[bg]!);
          expect(
            ratio,
            `${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
});
