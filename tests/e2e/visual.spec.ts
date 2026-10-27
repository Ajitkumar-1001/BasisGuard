/// <reference lib="dom" />
// page.evaluate callbacks touch document/window; the e2e tsconfig has no DOM lib.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
// Relative import: the e2e tsconfig has no `@/` alias. css-blocks.ts has no internal imports of
// its own, so (unlike the fixture modules) nothing about it actually needs that alias.
import { extractDarkRootBlock } from "../../frontend/src/ui/css-blocks";

// Hard-coded: the e2e tsconfig has no `@/` alias, and the fixture modules import via it.
// Source of truth: frontend/src/ui/fixtures/runs.ts (Northwind) and evaluations.ts (v3, v4-draft).
const NORTHWIND = "6f1c2a4e-3b7d-4e19-9a52-0c8d7e41b3a1";
const EVAL_V3 = "2c8e4f10-5d93-4b27-96a1-d07f3b8e5c42";
const EVAL_V4_DRAFT = "9a1d6b37-8c20-4e5f-b4d8-6f3a0c7e1925";

// name: the stable baseline filename — a route label, never a ${NORTHWIND}-style fixture id (those
// are fixed constants, so embedding them would already be stable) and never the live run's random
// id (see routes() below, where that would be fatal: a fresh id every run means a never-existing
// baseline file every run).
const STATIC_ROUTES: { path: string; name: string }[] = [
  { path: "/", name: "root" },
  { path: "/runs", name: "runs" },
  { path: "/runs/new", name: "runs-new" },
  { path: `/examples/runs/${NORTHWIND}`, name: "example-northwind" },
  { path: "/evaluations", name: "evaluations" },
  { path: `/evaluations/${EVAL_V3}`, name: "eval-v3" },
  { path: `/evaluations/${EVAL_V4_DRAFT}`, name: "eval-v4-draft" },
];

const WIDTHS = [375, 768, 1024, 1440];
const THEMES = ["light", "dark"] as const;

// "/" and "/runs" render a client-fetched, DB-backed runs list. Other spec files (and, within one
// `playwright test` invocation, the chromium project running before this one) create rows in the
// same shared basisguard_test table, so without pinning this response the screenshot would vary
// with execution order instead of with real UI regressions. Masking can't fix this: an added/
// removed row changes table height, not just pixel content within a fixed box.
const PINNED_RUNS_RESPONSE = {
  runs: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      status: "complete",
      errorCode: null,
      policy: "baseline",
      companyName: "Visual Gate Fixture",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

async function pinRunsList(page: Page): Promise<void> {
  await page.route(/\/api\/runs(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: PINNED_RUNS_RESPONSE });
  });
}

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

function routes(): { path: string; name: string }[] {
  return [...STATIC_ROUTES, { path: runRoute, name: "run-live" }];
}

async function assertNoOverflowOrClipping(page: Page, route: string): Promise<void> {
  const res = await page.goto(route);
  expect(res?.status(), `GET ${route}`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // "/" and "/runs" render RunsList's fetch client-side, after this page's h1 is already visible.
  // Without waiting for the pinned row, the clipping walk and the screenshot below could both race
  // a still-loading list into the baseline.
  if (route === "/" || route === "/runs") {
    await expect(page.getByRole("link", { name: "Visual Gate Fixture" })).toBeVisible();
  }

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
      test(`no overflow or clipping at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await pinRunsList(page);
        for (const { path, name } of routes()) {
          await assertNoOverflowOrClipping(page, path);
          // soft: one route's diff is reported without skipping the rest; the test still fails overall.
          await expect.soft(page).toHaveScreenshot(`${name}.png`, {
            fullPage: true,
            // /runs/new seeds as_of_date to today's date client-side (new-run-form.tsx); mask it so
            // the baseline doesn't go stale every day. No-op on routes without this input.
            mask: [page.locator('input[name="as_of_date"]')],
          });
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
  const darkBlock = extractDarkRootBlock(css);
  const hex = darkBlock.match(/--color-canvas:\s*(#[0-9A-Fa-f]{6})/)?.[1];
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

function parseRgb(value: string): [number, number, number] {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!m) throw new Error(`unparseable computed color: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function liveContrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(parseRgb(fg));
  const b = relativeLuminance(parseRgb(bg));
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

// Live computed-style proof for critical pairs, beyond the body-only check above: a cascade/
// @theme mismatch could leave a utility class unstyled while the regex-parsed CSS (tokens.test.ts)
// stays green, since that test never renders anything. Each pair is measured in both themes so a
// silent fallback to light values (which might still happen to pass 4.5:1) can't hide as a pass.
test.describe("dark theme: live computed-style contrast for critical pairs", () => {
  test("nav wordmark: text-ink on bg-panel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const aside = page.locator("aside");
    const wordmark = aside.getByRole("link", { name: "BasisGuard" });

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/runs/new");
    const lightFg = await wordmark.evaluate((el) => getComputedStyle(el).color);
    const lightBg = await aside.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const darkFg = await wordmark.evaluate((el) => getComputedStyle(el).color);
    const darkBg = await aside.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(darkBg, "aside background is transparent").not.toBe("rgba(0, 0, 0, 0)");
    expect(liveContrastRatio(lightFg, lightBg), `light ${lightFg} on ${lightBg}`).toBeGreaterThanOrEqual(4.5);
    expect(liveContrastRatio(darkFg, darkBg), `dark ${darkFg} on ${darkBg}`).toBeGreaterThanOrEqual(4.5);
    expect(darkFg).not.toBe(lightFg);
    expect(darkBg).not.toBe(lightBg);
  });

  test("primary button: text-panel on bg-petrol", async ({ page }) => {
    const button = page.getByRole("button", { name: "Start run" });

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/runs/new");
    const lightFg = await button.evaluate((el) => getComputedStyle(el).color);
    const lightBg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const darkFg = await button.evaluate((el) => getComputedStyle(el).color);
    const darkBg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(darkBg, "button background is transparent").not.toBe("rgba(0, 0, 0, 0)");
    expect(liveContrastRatio(lightFg, lightBg), `light ${lightFg} on ${lightBg}`).toBeGreaterThanOrEqual(4.5);
    expect(liveContrastRatio(darkFg, darkBg), `dark ${darkFg} on ${darkBg}`).toBeGreaterThanOrEqual(4.5);
    expect(darkFg).not.toBe(lightFg);
    expect(darkBg).not.toBe(lightBg);
  });

  test("tone badge: a contradicted claim's verdict text on its tint background", async ({ page }) => {
    async function badgeColors(): Promise<{ fg: string; bg: string }> {
      const row = page.getByRole("row").filter({ hasText: "/founders/1" });
      const badge = row.getByText("Contradicted", { exact: true });
      return {
        fg: await badge.evaluate((el) => getComputedStyle(el).color),
        bg: await badge.evaluate((el) => getComputedStyle(el).backgroundColor),
      };
    }

    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/examples/runs/${NORTHWIND}`);
    const light = await badgeColors();

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const dark = await badgeColors();

    expect(dark.bg, "badge background is transparent — selector likely missed the tone span").not.toBe("rgba(0, 0, 0, 0)");
    expect(liveContrastRatio(light.fg, light.bg), `light ${light.fg} on ${light.bg}`).toBeGreaterThanOrEqual(4.5);
    expect(liveContrastRatio(dark.fg, dark.bg), `dark ${dark.fg} on ${dark.bg}`).toBeGreaterThanOrEqual(4.5);
    expect(dark.fg).not.toBe(light.fg);
    expect(dark.bg).not.toBe(light.bg);
  });
});
