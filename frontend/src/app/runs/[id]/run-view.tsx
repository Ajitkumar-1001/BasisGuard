"use client";

import { useEffect, useState } from "react";
import { fromApiDetail, type ApiRunDetail, type ApiRunEvent } from "@/ui/from-api";
import { RunInspector } from "@/ui/run-inspector";

const TERMINAL = new Set(["complete", "needs_review", "failed"]);

export function RunView({ runId }: { runId: string }) {
  const [detail, setDetail] = useState<ApiRunDetail | null>(null);
  const [events, setEvents] = useState<ApiRunEvent[]>([]);
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
          const next = (await d.json()) as ApiRunDetail;
          const evs = ((await e.json()) as { events: ApiRunEvent[] }).events;
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

  if (error) return <p role="alert" className="text-sm text-brick">{error}</p>;
  if (!detail) return <p className="text-sm text-ink-muted">Loading run…</p>;
  return <RunInspector view={fromApiDetail(detail, events)} />;
}
