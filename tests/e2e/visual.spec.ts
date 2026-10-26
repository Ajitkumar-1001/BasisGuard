/// <reference lib="dom" />
// page.evaluate callbacks touch document/window; the e2e tsconfig has no DOM lib.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// Hard-coded: the e2e tsconfig has no `@/` alias, and the fixture modules import via it.
// Source of truth: frontend/src/ui/fixtures/runs.ts (Northwind) and evaluations.ts (v3, v4-draft).
const NORTHWIND = "6f1c2a4e-3b7d-4e19-9a52-0c8d7e41b3a1";
const EVAL_V3 = "2c8e4f10-5d93-4b27-96a1-d07f3b8e5c42";
const EVAL_V4_DRAFT = "9a1d6b37-8c20-4e5f-b4d8-6f3a0c7e1925";

const STATIC_ROUTES = [
  "/",
  "/runs",
  "/runs/new",
  `/examples/runs/${NORTHWIND}`,
  "/evaluations",
  `/evaluations/${EVAL_V3}`,
  `/evaluations/${EVAL_V4_DRAFT}`,
];

const WIDTHS = [375, 768, 1024, 1440];
const THEMES = ["light", "dark"] as const;

// A fixture-mode run created once per worker through the same-origin HTTP API (mirrors
// tests/e2e/api.spec.ts), so /runs/[id] is covered alongside the statically-known routes. No
// worker is started: the run stays "queued", which is enough to render the page.
let runRoute = "";
test.beforeAll(async ({ request }) => {
  const res = await request.post("/api/runs", {
    data: {
      request_key: crypto.randomUUID(),
      company_name: "Visual Gate Co",
      profile: "startup_facts_v1",
      policy: "baseline",
      as_of_date: "2026-10-17",
    },
  });
  expect(res.status()).toBe(202);
  const { runId } = (await res.json()) as { runId: string };
  runRoute = `/runs/${runId}`;
});

function routes(): string[] {
  return [...STATIC_ROUTES, runRoute];
}

async function assertNoOverflowOrClipping(page: Page, route: string): Promise<void> {
  const res = await page.goto(route);
  expect(res?.status(), `GET ${route}`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${route}: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);

  // An interactive element only counts as "clipped" if a real ancestor boundary (overflow(-x):
  // hidden|clip) cuts it off before any scrollable ancestor is reached. A scrollable ancestor
  // (overflow(-x): auto|scroll, e.g. TableScroll, the tablist) makes the element reachable by
  // scrolling that container, which is not clipping, so the walk stops there. The page-level
  // scrollWidth <= clientWidth assertion above already covers whole-document overflow.
  // sr-only elements (the skip link) are 1x1 by design and are excluded.
  const offenders = await page.evaluate(() => {
    function clippedByAncestor(el: Element): boolean {
      const elRect = el.getBoundingClientRect();
      for (let node = el.parentElement; node; node = node.parentElement) {
        const cs = getComputedStyle(node);
        const ox = cs.overflowX;
        if (ox === "hidden" || ox === "clip") {
          const nodeRect = node.getBoundingClientRect();
          if (elRect.left < nodeRect.left - 1 || elRect.right > nodeRect.right + 1) return true;
        } else if (ox === "auto" || ox === "scroll") {
          return false;
        }
      }
      return false;
    }
    const found: string[] = [];
    document.querySelectorAll("a, button, input, select, textarea, [role='button'], [role='tab'], summary").forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.classList.contains("sr-only") || htmlEl.closest(".sr-only")) return;
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // not rendered (e.g. inactive tabpanel content)
      if (clippedByAncestor(htmlEl)) {
        found.push(`${htmlEl.tagName.toLowerCase()} "${(htmlEl.textContent ?? "").trim().slice(0, 40)}"`);
      }
    });
    return found;
  });
  expect(offenders, `${route}: clipped interactive elements:\n${offenders.join("\n")}`).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const width of WIDTHS) {
      test(`no overflow or clipping at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        for (const route of routes()) {
          await assertNoOverflowOrClipping(page, route);
          const name = route === "/" ? "root" : route.replace(/\//g, "_").replace(/^_/, "");
          await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
        }
      });
    }
  });
}

test("dark-mode surfaces actually change: body background matches the parsed dark token and differs from light", async ({
  page,
}) => {
  const cssPath = fileURLToPath(new URL("../../frontend/src/app/globals.css", import.meta.url));
  const css = readFileSync(cssPath, "utf8");
  const darkBlock = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/)?.[1];
  const hex = darkBlock?.match(/--color-canvas:\s*(#[0-9A-Fa-f]{6})/)?.[1];
  if (!hex) throw new Error("dark --color-canvas not found in globals.css");
  const n = parseInt(hex.slice(1), 16);
  const expectedDarkRgb = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/runs");
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(darkBg, "computed body background under prefers-color-scheme: dark").toBe(expectedDarkRgb);
  expect(darkBg).not.toBe(lightBg);
});
