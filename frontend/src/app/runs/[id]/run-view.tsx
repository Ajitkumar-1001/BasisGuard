"use client";

import { useEffect, useState } from "react";

// Mirrors handleGetRun / handleGetRunEvents in src/server/handlers.ts (the Task 14 contract).
type Detail = {
  run: {
    id: string;
    status: string;
    errorCode: string | null;
    policy: string;
    processor: string;
    providerRunId: string | null;
    input: Record<string, unknown>;
    createdAt: string;
    completedAt: string | null;
    deadlineAt: string;
  };
  taskArtifact: { id: string; contentHash: string; fixtureOrigin: string | null; content: unknown; basis: unknown } | null;
  spend: { usd: string; httpRequests: number; byCostKind: Record<"reported" | "estimated" | "unknown", number> };
};
type Ev = { id: string; type: string; createdAt: string; details: unknown };
const TERMINAL = new Set(["complete", "needs_review", "failed"]);

export function RunView({ runId }: { runId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const [d, e] = await Promise.all([fetch(`/api/runs/${runId}`), fetch(`/api/runs/${runId}/events`)]);
        if (!alive) return;
        if (d.status === 404) {
          setError(`run ${runId} not found`);
          return;
        }
        if (d.ok && e.ok) {
          const next = (await d.json()) as Detail;
          const evs = ((await e.json()) as { events: Ev[] }).events;
          if (!alive) return;
          setDetail(next);
          setEvents(evs);
          if (TERMINAL.has(next.run.status)) return;
        }
      } catch {
        // Transient fetch failure: keep polling.
      }
      if (alive) timer = setTimeout(tick, 1000);
    }
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [runId]);

  if (error) return <p role="alert">{error}</p>;
  if (!detail) return <p>Loading run…</p>;
  const { run, taskArtifact, spend } = detail;
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{String(run.input.company_name)}</h1>
        <p>
          Status: <strong data-testid="run-status">{run.status}</strong>
          {run.errorCode && <> — <code data-testid="run-error">{run.errorCode}</code></>}
        </p>
        <p className="text-sm">
          Policy {run.policy} · processor {run.processor} · as of {String(run.input.as_of_date)} · provider run {run.providerRunId ?? "—"}
        </p>
        <p className="text-sm">
          Spend USD {spend.usd} ({spend.httpRequests} requests; estimated {spend.byCostKind.estimated}, unknown {spend.byCostKind.unknown})
        </p>
      </header>
      {taskArtifact && (
        <>
          <section>
            <h2 className="font-semibold">
              Task original <span className="ml-2 rounded border px-1 text-xs">unverified</span>
            </h2>
            <p className="text-xs">
              artifact {taskArtifact.contentHash.slice(0, 16)}…
              {taskArtifact.fixtureOrigin && <> · synthetic fixture ({taskArtifact.fixtureOrigin})</>}
            </p>
            <pre data-testid="task-content" className="overflow-x-auto rounded border p-3 text-xs">{JSON.stringify(taskArtifact.content, null, 2)}</pre>
          </section>
          <section>
            <h2 className="font-semibold">Native Research Basis (upstream metadata)</h2>
            <pre className="overflow-x-auto rounded border p-3 text-xs">{JSON.stringify(taskArtifact.basis, null, 2)}</pre>
          </section>
        </>
      )}
      <section>
        <h2 className="font-semibold">Events</h2>
        <ol className="list-decimal pl-6 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <code>{e.type}</code> <span className="text-xs">{e.createdAt}</span>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
