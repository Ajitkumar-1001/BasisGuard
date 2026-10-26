/// <reference lib="dom" />
// page.evaluate callbacks touch document/window; the e2e tsconfig has no DOM lib.
import { expect, test, type Page } from "@playwright/test";

// Hard-coded: the e2e tsconfig has no `@/` alias, and the fixture modules import via it.
// Source of truth: frontend/src/ui/fixtures/runs.ts (Northwind) and evaluations.ts (v3, v4-draft).
const NORTHWIND = "6f1c2a4e-3b7d-4e19-9a52-0c8d7e41b3a1";
const EVAL_V3 = "2c8e4f10-5d93-4b27-96a1-d07f3b8e5c42";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

const ROUTES = ["/", "/runs", "/runs/new", `/examples/runs/${NORTHWIND}`, "/evaluations", `/evaluations/${EVAL_V3}`];

async function open(page: Page, route: string): Promise<void> {
  const res = await page.goto(route);
  expect(res?.status(), `GET ${route}`).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test.describe("landmarks and ARIA", () => {
  for (const route of ROUTES) {
    test(`${route} has a main landmark, a labelled nav and an h1`, async ({ page }) => {
      await open(page, route);
      await expect(page.locator("main#content")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }
});

test.describe("keyboard tab order and focus visibility", () => {
  for (const route of ROUTES) {
    test(`${route}: Tab reaches every enabled, visible control with a visible focus indicator`, async ({ page }) => {
      await open(page, route);

      // Tag every control that should be in the native Tab sequence: visible, not disabled, and not
      // deliberately removed from the sequence (tabIndex < 0, e.g. the unselected tabs in the
      // roving-tabindex tablist, or focusable content inside a hidden tabpanel).
      const expectedCount = await page.evaluate(() => {
        const candidates = Array.from(
          document.querySelectorAll('a[href], button, input, select, textarea, [role="tab"], [tabindex]'),
        ) as HTMLElement[];
        const expected = candidates.filter((el) => {
          if ((el as HTMLButtonElement).disabled) return false;
          if (el.tabIndex < 0) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          const style = getComputedStyle(el);
          return style.visibility !== "hidden" && style.display !== "none";
        });
        expected.forEach((el, i) => el.setAttribute("data-a11y-probe", String(i)));
        return expected.length;
      });
      expect(expectedCount, `${route}: no focusable controls found`).toBeGreaterThan(0);

      const seen = new Set<string>();
      const maxPresses = expectedCount + 5;
      for (let i = 0; i < maxPresses && seen.size < expectedCount; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return null;
          const cs = getComputedStyle(el);
          const type = (el as HTMLInputElement).type ?? "";
          const described = `${el.tagName.toLowerCase()}${type ? `[type=${type}]` : ""}${(el as HTMLInputElement).name ? `[name=${(el as HTMLInputElement).name}]` : ""}`;
          // Native multi-part widgets delegate focus to an internal shadow part in this browser:
          // document.activeElement reports the host, but :focus-visible does not match the host
          // itself, so our CSS outline on the host is unobservable here even though the browser
          // paints its own native focus affordance. Narrowly scoped to these known native-widget
          // input types only, so it can never silently exempt an ordinary link or button.
          const NATIVE_WIDGET_TYPES = new Set(["date", "time", "datetime-local", "month", "week", "color", "range", "file", "number"]);
          const isNativeWidget = el.tagName === "INPUT" && NATIVE_WIDGET_TYPES.has(type);
          return {
            probe: el.getAttribute("data-a11y-probe"),
            outlineStyle: cs.outlineStyle,
            outlineWidth: cs.outlineWidth,
            skipOutlineCheck: isNativeWidget && !el.matches(":focus-visible"),
            described,
          };
        });
        if (!info) continue;
        if (info.probe !== null) {
          seen.add(info.probe);
          if (!info.skipOutlineCheck) {
            expect(info.outlineStyle, `${route}: no focus-visible outline on probe ${info.probe} (${info.described})`).not.toBe(
              "none",
            );
            expect(
              parseFloat(info.outlineWidth),
              `${route}: zero-width focus outline on probe ${info.probe} (${info.described})`,
            ).toBeGreaterThan(0);
          }
        }
      }
      expect(seen.size, `${route}: reached ${seen.size}/${expectedCount} focusable controls by Tab`).toBe(expectedCount);
    });
  }
});

test.describe("claim drawer: Escape closes it and returns focus to its trigger", () => {
  test("self-contained on the seeded example page", async ({ page }) => {
    await open(page, `/examples/runs/${NORTHWIND}`);
    const row = page.getByRole("row").filter({ hasText: "/founders/1" });
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(row).toBeFocused();
  });
});

test.describe("reduced motion", () => {
  // Project-level use.reducedMotion = "reduce" (see playwright.config.ts) emulates
  // prefers-reduced-motion; globals.css then zeroes every transition/animation duration.
  test("every element resolves to a zero transition and animation duration", async ({ page }) => {
    await open(page, `/examples/runs/${NORTHWIND}`);
    const offenders = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("*").forEach((el) => {
        const cs = getComputedStyle(el);
        const durations = `${cs.transitionDuration},${cs.animationDuration}`.split(",").map((d) => d.trim());
        if (durations.some((d) => d !== "" && d !== "0s")) {
          bad.push(`${el.tagName.toLowerCase()}: transition=${cs.transitionDuration} animation=${cs.animationDuration}`);
        }
      });
      return bad;
    });
    expect(offenders, `non-zero duration under reduced motion:\n${offenders.join("\n")}`).toEqual([]);
  });
});

test.describe("loading, error and empty states", () => {
  // Same-origin route interception (no vendor network involved): deterministically forces each
  // client-rendered state regardless of what other spec files left in the database.
  for (const route of ["/", "/runs"]) {
    test(`${route}: RunsList's loading, error and empty states each render`, async ({ page }) => {
      let releaseLoading: () => void = () => {};
      const loadingGate = new Promise<void>((resolve) => {
        releaseLoading = resolve;
      });
      await page.route(/\/api\/runs(\?.*)?$/, async (route_) => {
        if (route_.request().method() !== "GET") return route_.continue();
        await loadingGate;
        await route_.fulfill({ json: { runs: [] } });
      });
      const nav = page.goto(route);
      await expect(page.getByText("Loading…")).toBeVisible();
      releaseLoading();
      await nav;
      await expect(page.getByText("No runs yet")).toBeVisible();
      await page.unroute(/\/api\/runs(\?.*)?$/);

      await page.route(/\/api\/runs(\?.*)?$/, async (route_) => {
        if (route_.request().method() !== "GET") return route_.continue();
        await route_.fulfill({ status: 500, body: "forced failure for the accessibility gate" });
      });
      await page.reload();
      await expect(page.getByText("Could not load runs")).toBeVisible();
      await page.unroute(/\/api\/runs(\?.*)?$/);
    });
  }

  test("/runs/new: a failed submission renders an inline error", async ({ page }) => {
    await open(page, "/runs/new");
    await page.route(/\/api\/runs(\?.*)?$/, async (route_) => {
      if (route_.request().method() !== "POST") return route_.continue();
      await route_.fulfill({
        status: 500,
        json: { code: "forced_error", message: "forced failure for the accessibility gate" },
      });
    });
    await page.getByLabel("Company name").fill("A11y Gate Co");
    await page.getByRole("button", { name: "Start run" }).click();
    // Scoped past role=alert: Next also injects its own route-announcer live region with the same role.
    await expect(page.locator('p[role="alert"]')).toContainText("forced_error");
  });

  // Both fixture detail routes await their id inside a Suspense boundary for partial prerendering
  // (see the page.tsx comments), so the static shell's 200 status is already flushed before the
  // inner notFound() call resolves; the HTTP status stays 200 even though the body is the
  // not-found view. Asserting the rendered not-found content is the meaningful check here.
  test("/examples/runs/<unknown>: renders the seeded-example not-found state", async ({ page }) => {
    await page.goto(`/examples/runs/${UNKNOWN_ID}`);
    await expect(page.getByText("Seeded example not found")).toBeVisible();
  });

  test("/evaluations/<unknown>: renders the evaluation not-found state", async ({ page }) => {
    await page.goto(`/evaluations/${UNKNOWN_ID}`);
    await expect(page.getByText("Evaluation not found")).toBeVisible();
  });

  // /runs/[id] is client-polled (no generateStaticParams/notFound here), so this one page's error
  // path renders only the inline alert paragraph with no heading at all: unlike open(), it must not
  // require an h1.
  test("/runs/<unknown>: renders an inline not-found error, not a crash", async ({ page }) => {
    const res = await page.goto(`/runs/${UNKNOWN_ID}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('p[role="alert"]')).toContainText(`${UNKNOWN_ID} not found`);
  });

  // Not independently triggerable: /evaluations/[id] and /examples/runs/[id] are built with
  // generateStaticParams and resolve their Suspense boundary inside a prerendered shell, so the
  // "Loading evaluation…" / "Loading seeded example…" fallback text is not observable from here.
});
