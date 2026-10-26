import { describe, expect, it } from "vitest";
import { extractBraceBlock, extractDarkRootBlock, extractThemeBlock } from "./css-blocks";

// Mirrors globals.css's shape, with a nested rule inside @theme and a nested media query inside
// the dark :root block, so a non-brace-aware (non-greedy regex) extractor would truncate early.
const SAMPLE = `
@theme {
  --color-a: #000000;
  .nested-selector { color: red; }
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-a: #ffffff;
    @media (min-width: 10px) {
      --color-b: #111111;
    }
  }
}
`;

describe("extractBraceBlock", () => {
  it("returns the full block content even when it contains nested braces", () => {
    const block = extractBraceBlock(SAMPLE, /@theme\s*\{/);
    expect(block).toContain("--color-a: #000000;");
    expect(block).toContain(".nested-selector { color: red; }");
    expect(block).not.toContain("prefers-color-scheme");
  });

  it("throws clearly when the opener is not found", () => {
    expect(() => extractBraceBlock(SAMPLE, /@theme-missing\s*\{/)).toThrow(/opener not found/);
  });

  it("throws clearly when the block is unterminated", () => {
    expect(() => extractBraceBlock("@theme { --color-a: #000000;", /@theme\s*\{/)).toThrow(/unterminated/);
  });
});

describe("extractThemeBlock", () => {
  it("extracts the light block, not the dark block's values", () => {
    const theme = extractThemeBlock(SAMPLE);
    expect(theme).toContain("--color-a: #000000;");
    expect(theme).not.toContain("--color-a: #ffffff;");
  });
});

describe("extractDarkRootBlock", () => {
  it("extracts only the nested :root content, including its own nested braces", () => {
    const dark = extractDarkRootBlock(SAMPLE);
    expect(dark).toContain("--color-a: #ffffff;");
    expect(dark).toContain("@media (min-width: 10px)");
    expect(dark).toContain("--color-b: #111111;");
    expect(dark).not.toContain("--color-a: #000000;");
  });
});
