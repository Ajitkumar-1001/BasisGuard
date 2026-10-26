"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunStatus } from "@basisguard/contracts";
import { ButtonLink } from "@/ui/button";
import { formatAt } from "@/ui/format";
import { RUN_STATUS_META } from "@/ui/status";
import { StatusBadge } from "@/ui/status-badge";
import { EmptyState, ErrorState } from "@/ui/states";
import { TableScroll, Td, Th, Tr } from "@/ui/table";

// Mirrors handleListRuns in src/server/handlers.ts. companyName is null for a malformed stored row.
type Row = { id: string; status: RunStatus; errorCode: string | null; policy: string; companyName: string | null; createdAt: string };

export function RunsList({ limit = 50 }: { limit?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/runs?limit=${limit}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setRows(((await r.json()) as { runs: Row[] }).runs);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "request failed"));
  }, [limit]);
  if (error) return <ErrorState title="Could not load runs" code={error} body="The runs API did not respond. Reload the page to try again." />;
  if (!rows) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (rows.length === 0)
    return (
      <EmptyState
        title="No runs yet"
        body="Start a research run to see its original output and status here."
        action={<ButtonLink href="/runs/new">Start a run</ButtonLink>}
      />
    );
  return (
    <TableScroll>
      <table className="w-full min-w-[40rem] border-collapse">
        <thead>
          <tr>
            <Th>Company</Th>
            <Th>Policy</Th>
            <Th>Status</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = RUN_STATUS_META[r.status];
            return (
              <Tr key={r.id}>
                <Td>
                  <Link className="text-petrol underline hover:text-petrol-hover" href={`/runs/${r.id}`}>
                    {r.companyName ?? r.id}
                  </Link>
                </Td>
                <Td>{r.policy}</Td>
                <Td>
                  {meta ? <StatusBadge meta={meta} code={r.errorCode ? `${r.status} (${r.errorCode})` : r.status} /> : <code className="num text-xs">{r.status}</code>}
                </Td>
                <Td className="num text-xs text-ink-muted">{formatAt(r.createdAt)}</Td>
              </Tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}
