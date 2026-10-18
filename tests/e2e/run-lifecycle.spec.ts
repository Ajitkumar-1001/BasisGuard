import { expect, test } from "@playwright/test";
import type { DbHandle } from "../../packages/db/src/client";
import { killAllWorkers, openResetDb, startWorker, stopWorker, type WorkerProc } from "./helpers";

// Must equal FIXTURE_ORIGIN in packages/providers/src/fixture-provider.ts (literal: that module imports JSON).
const FIXTURE_ORIGIN = "hand-authored:parallel-web@1.3.5-types";

let worker: WorkerProc | undefined;
let handle: DbHandle | undefined;
test.beforeAll(async () => {
  handle = await openResetDb();
  worker = await startWorker();
});
test.afterAll(async () => {
  try {
    if (worker) await stopWorker(worker);
  } finally {
    killAllWorkers();
    await handle?.close();
  }
});

test("double-clicked submit creates one run that completes and survives refresh", async ({ page, request }) => {
  const company = `E2E Corp ${Date.now()}`;
  await page.goto("/runs/new");
  await page.getByLabel("Company name").fill(company);
  await page.getByRole("button", { name: "Start run" }).dblclick();
  await page.waitForURL(/\/runs\/[0-9a-f-]{36}$/);
  const runId = page.url().split("/").pop()!;
  await expect(page.getByTestId("run-status")).toHaveText("complete", { timeout: 30_000 });
  await expect(page.getByTestId("task-content")).toContainText("San Francisco");
  await expect(page.getByText("unverified", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("run-status")).toHaveText("complete");

  const { runs } = await (await request.get("/api/runs?limit=100")).json();
  expect(runs.filter((r: { companyName: string }) => r.companyName === company)).toHaveLength(1);

  // Task 14 parked: GET /api/runs/:id for a completed run carries the stored task artifact.
  const detail = await request.get(`/api/runs/${runId}`);
  expect(detail.status()).toBe(200);
  const { run, taskArtifact } = await detail.json();
  expect(run.status).toBe("complete");
  expect(taskArtifact).not.toBeNull();
  expect(taskArtifact.contentHash).toMatch(/^[0-9a-f]{64}$/);
  expect(taskArtifact.fixtureOrigin).toBe(FIXTURE_ORIGIN);
  expect(typeof taskArtifact.content).toBe("object");
  expect(taskArtifact.content).not.toBeNull();
  expect(JSON.stringify(taskArtifact.content)).toContain("San Francisco");
  expect(Array.isArray(taskArtifact.basis)).toBe(true);
  expect(taskArtifact.basis.length).toBeGreaterThan(0);
});

test("upstream task failure is shown as a terminal failed run", async ({ page }) => {
  await page.goto("/runs/new");
  await page.getByLabel("Company name").fill("Fixture Task Failure");
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByTestId("run-status")).toHaveText("failed", { timeout: 30_000 });
  await expect(page.getByTestId("run-error")).toHaveText("provider_task_failed");
});
