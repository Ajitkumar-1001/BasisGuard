"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Mirrors handleListRuns in src/server/handlers.ts. companyName is null for a malformed stored row.
type Row = { id: string; status: string; errorCode: string | null; policy: string; companyName: string | null; createdAt: string };

export function RunsList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/runs?limit=50")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setRows(((await r.json()) as { runs: Row[] }).runs);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "request failed"));
  }, []);
  if (error) return <p role="alert">Could not load runs ({error}).</p>;
  if (!rows) return <p>Loading…</p>;
  if (rows.length === 0) return <p>No runs yet. <Link className="underline" href="/runs/new">Start one</Link>.</p>;
  return (
    <table className="text-sm">
      <thead>
        <tr>
          <th className="pr-4 text-left">Company</th>
          <th className="pr-4 text-left">Status</th>
          <th className="text-left">Created</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="pr-4"><Link className="underline" href={`/runs/${r.id}`}>{r.companyName ?? r.id}</Link></td>
            <td className="pr-4">{r.status}{r.errorCode ? ` (${r.errorCode})` : ""}</td>
            <td>{r.createdAt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
