"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NewRunForm() {
  const router = useRouter();
  // One key per mount, minted on first submit (not during render: cacheComponents prerenders this form);
  // retries and double-clicks reuse it (FR-01). A refresh mounts a new form/key.
  const requestKey = useRef<string | null>(null);
  const [asOf, setAsOf] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setAsOf(new Date().toISOString().slice(0, 10)), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    requestKey.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const domain = String(f.get("official_domain") ?? "").trim();
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request_key: requestKey.current,
        company_name: String(f.get("company_name") ?? ""),
        ...(domain ? { official_domain: domain } : {}),
        profile: "startup_facts_v1",
        as_of_date: String(f.get("as_of_date") ?? ""),
        processor: "base",
        policy: String(f.get("policy") ?? "baseline"),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { runId?: string; code?: string; message?: string };
    if ((res.status === 200 || res.status === 202) && json.runId) {
      router.push(`/runs/${json.runId}`);
      return;
    }
    setPending(false);
    setError(`${json.code ?? res.status}: ${json.message ?? "request failed"}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-describedby="cost-note">
      <label className="block">
        <span className="text-sm font-medium">Company name</span>
        <input name="company_name" required minLength={2} maxLength={120} className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Official domain (optional)</span>
        <input name="official_domain" placeholder="example.com" className="mt-1 w-full rounded border px-2 py-1" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">As-of date (UTC)</span>
        <input name="as_of_date" type="date" required value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 rounded border px-2 py-1" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Policy</legend>
        <label className="flex gap-2"><input type="radio" name="policy" value="baseline" defaultChecked /> baseline (original output, unverified)</label>
        <label className="flex gap-2 opacity-60"><input type="radio" name="policy" value="verify" disabled /> verify (Phase 2)</label>
        <label className="flex gap-2 opacity-60"><input type="radio" name="policy" value="verify_and_repair" disabled /> verify_and_repair (Phase 4)</label>
      </fieldset>
      <p id="cost-note" className="text-sm">
        Profile <code>startup_facts_v1</code>, processor <code>base</code>. In live mode this calls Parallel and may cost money:
        upper bound USD 0.010 per Task, run ceiling USD 5.00.
      </p>
      <button type="submit" disabled={pending} className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? "Submitting…" : "Start run"}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
