import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKIP = /(^|\/)(node_modules|\.next|coverage|drizzle|playwright-report|test-results)(\/|$)/;

function sources(dir: string): string[] {
  if (!existsSync(join(ROOT, dir))) return []; // apps/ does not exist until the worker task lands
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx|mts|mjs|js)$/.test(d.name))
    .map((d) => relative(ROOT, join(d.parentPath, d.name)))
    .filter((p) => !SKIP.test(p));
}
const files = [...sources("frontend"), ...sources("apps"), ...sources("packages"), ...sources("scripts")];
const importsOf = (p: string, mod: string) =>
  new RegExp(`(from\\s+|import\\s+|import\\s*\\(\\s*|vi\\.mock\\(\\s*)["']${mod.replace("/", "\\/")}["']`).test(readFileSync(join(ROOT, p), "utf8"));

describe("import boundaries", () => {
  it("parallel-web is imported only by the live adapter and the Gate A probe (and test mocks)", () => {
    const allowed = (p: string) => p.startsWith("packages/providers/src/live/") || p === "scripts/gate-a-probe.ts" || p.endsWith(".test.ts");
    expect(files.filter((p) => importsOf(p, "parallel-web") && !allowed(p))).toEqual([]);
  });

  it("only the live client factory constructs the Parallel SDK client (base URL pinned, maxRetries 0)", () => {
    const constructs = (p: string) => /new\s+Parallel\s*\(/.test(readFileSync(join(ROOT, p), "utf8"));
    expect(files.filter((p) => constructs(p) && !p.endsWith(".test.ts"))).toEqual(["packages/providers/src/live/client.ts"]);
  });

  it("the web app never imports providers or parallel-web (only the worker calls upstream)", () => {
    const web = files.filter((p) => p.startsWith("frontend/"));
    expect(web.length).toBeGreaterThan(0); // guards against a vacuous scan if the web app path changes
    expect(web.filter((p) => importsOf(p, "@basisguard/providers") || importsOf(p, "parallel-web"))).toEqual([]);
  });

  it("web non-test sources import @basisguard/db only via the runtime-only subpath", () => {
    const web = files.filter((p) => p.startsWith("frontend/") && !p.endsWith(".test.ts"));
    expect(web.filter((p) => importsOf(p, "@basisguard/db"))).toEqual([]);
    expect(web.some((p) => importsOf(p, "@basisguard/db/runtime"))).toBe(true);
  });
});
