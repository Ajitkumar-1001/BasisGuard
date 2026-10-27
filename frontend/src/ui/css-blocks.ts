/** Extracts the content of the first brace-delimited block whose opener matches `opener`. `opener`
 *  must match through the block's own opening brace (inclusive), so callers can target a block
 *  nested inside another (e.g. the `:root` block inside an `@media` rule) precisely. Brace-aware:
 *  braces nested inside the block (a nested rule, a selector body, ...) never end the match early,
 *  unlike a non-greedy regex capture. Throws clearly if the opener, or its matching closing brace,
 *  is not found. */
export function extractBraceBlock(css: string, opener: RegExp): string {
  const m = opener.exec(css);
  if (!m) throw new Error(`block opener not found: ${opener}`);
  const start = m.index + m[0].length;
  let depth = 1;
  for (let i = start; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return css.slice(start, i);
    }
  }
  throw new Error(`unterminated block for opener: ${opener}`);
}

const THEME_OPENER = /@theme\s*\{/;
const DARK_ROOT_OPENER = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{/;

/** The light-token block: the top-level `@theme { ... }` rule in globals.css. */
export function extractThemeBlock(css: string): string {
  return extractBraceBlock(css, THEME_OPENER);
}

/** The dark-token block: the `:root { ... }` rule nested inside the dark-mode media query in
 *  globals.css. Returns only the inner `:root` content, not the surrounding media query. */
export function extractDarkRootBlock(css: string): string {
  return extractBraceBlock(css, DARK_ROOT_OPENER);
}
