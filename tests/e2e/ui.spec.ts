/// <reference lib="dom" />
// page.evaluate callbacks touch document/window; the e2e tsconfig has no DOM lib.
import { expect, test } from "@playwright/test";

// Hard-coded: the e2e tsconfig has no `@/` alias, and the fixture modules import via it.
// Source of truth: frontend/src/ui/fixtures/runs.ts (Northwind) and evaluations.ts (v3, v4-draft).
const NORTHWIND = "6f1c2a4e-3b7d-4e19-9a52-0c8d7e41b3a1";
const EVAL_V3 = "2c8e4f10-5d93-4b27-96a1-d07f3b8e5c42";
const EVAL_V4_DRAFT = "9a1d6b37-8c20-4e5f-b4d8-6f3a0c7e1925";

const PREVIEW_TEXT = "NOT HUMAN-REVIEWED — DO NOT QUOTE";
const FIXTURE_TEXT = "Seeded example · synthetic fixture data — not real Parallel output";

const ROUTES = [
  "/",
  "/runs",
  "/runs/new",
  `/examples/runs/${NORTHWIND}`,
  "/evaluations",
  `/evaluations/${EVAL_V3}`,
  `/evaluations/${EVAL_V4_DRAFT}`,
];
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test.describe(`no page-level horizontal scroll at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(m.scrollWidth, `scrollWidth ${m.scrollWidth} vs innerWidth ${m.innerWidth}`).toBeLessThanOrEqual(m.innerWidth);
      });
    }
  });
}

test("body uses the vendored Poppins font, not the system fallback", async ({ page }) => {
  await page.goto("/runs/new");
  const family = await page.evaluate(async () => {
    await document.fonts.ready;
    return getComputedStyle(document.body).fontFamily;
  });
  expect(family).not.toMatch(/^\s*(ui-sans-serif|system-ui)/i);
  const first = family.split(",")[0]!.trim();
  expect(first.length).toBeGreaterThan(0);
  expect(first.toLowerCase()).toContain("poppins");
  const loaded = await page.evaluate(async (f) => {
    await document.fonts.load(`14px ${f}`);
    return document.fonts.check(`14px ${f}`);
  }, first);
  expect(loaded).toBe(true);
});

test("demo walk: claims tab, drawer keyboard behaviour, tab arrows, repair history", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/examples/runs/${NORTHWIND}`);
  await expect(page.getByText(FIXTURE_TEXT)).toBeVisible();

  const claimsTab = page.getByRole("tab", { name: "Claims & Evidence" });
  await expect(claimsTab).toHaveAttribute("aria-selected", "true");

  const row = page.getByRole("row").filter({ hasText: "/founders/1" });
  await expect(row).toBeVisible();
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Contradicted");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(row).toBeFocused();

  // ArrowRight on the selected tab moves selection to the next tab (Initial Judge).
  await claimsTab.focus();
  await page.keyboard.press("ArrowRight");
  const judgeTab = page.getByRole("tab", { name: "Initial Judge" });
  await expect(judgeTab).toHaveAttribute("aria-selected", "true");
  await expect(claimsTab).toHaveAttribute("aria-selected", "false");

  await page.getByRole("tab", { name: "Automatic Repair History" }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByText("Budget exhausted").first()).toBeVisible();
  await expect(panel.getByText("Repair succeeded").first()).toBeVisible();
});

test("v4-draft evaluation shows the preview and fixture banners", async ({ page }) => {
  await page.goto(`/evaluations/${EVAL_V4_DRAFT}`);
  await expect(page.getByText(PREVIEW_TEXT, { exact: true })).toBeVisible();
  await expect(page.getByText(FIXTURE_TEXT)).toBeVisible();
});

test("v3 evaluation has the fixture banner and no preview banner", async ({ page }) => {
  await page.goto(`/evaluations/${EVAL_V3}`);
  await expect(page.getByText(FIXTURE_TEXT)).toBeVisible();
  await expect(page.getByText(PREVIEW_TEXT)).toHaveCount(0);
});
