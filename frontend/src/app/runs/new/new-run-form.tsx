"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Callout } from "@/ui/banners";
import { Button } from "@/ui/button";

const INPUT = "mt-1 block min-h-11 w-full rounded-md border border-line-strong bg-panel px-3 py-1.5 text-sm text-ink sm:min-h-9";

export function NewRunForm() {
  const router = useRouter();
  // One key per mount, minted on first submit (not during render: cacheComponents prerenders this form);
  // retries and double-clicks reuse it (FR-01). A refresh mounts a new form/key.
  const requestKey = useRef<string | null>(null);
  // The date defaults to today (UTC) on the client only (a server prerender would bake in a stale date). The input
  // stays uncontrolled and is filled through a ref after mount, so no setState-in-effect and no hydration mismatch.
  const asOfRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const input = asOfRef.current;
    if (input && !input.value) input.value = new Date().toISOString().slice(0, 10);
  }, []);

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
    <form onSubmit={onSubmit} className="space-y-5" aria-describedby="cost-note">
      <label className="block">
        <span className="text-sm font-medium text-ink">Company name</span>
        <input name="company_name" required minLength={2} maxLength={120} className={INPUT} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Official domain (optional)</span>
        <input name="official_domain" placeholder="example.com" className={INPUT} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">As-of date (UTC)</span>
        <input name="as_of_date" type="date" required ref={asOfRef} className={`${INPUT} sm:w-auto`} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Policy</legend>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="radio" name="policy" value="baseline" defaultChecked /> baseline (original output, unverified)</label>
        <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="radio" name="policy" value="verify" disabled /> verify (Phase 2)</label>
        <label className="flex items-center gap-2 text-sm text-ink-muted"><input type="radio" name="policy" value="verify_and_repair" disabled /> verify_and_repair (Phase 4)</label>
      </fieldset>
      <div id="cost-note">
        <Callout tone="ochre">
          <strong>Calls may cost money.</strong> Profile <code>startup_facts_v1</code>, processor <code>base</code>. In live mode this calls Parallel and may cost money:
          upper bound USD 0.010 per Task, run ceiling USD 5.00.
        </Callout>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Start run"}
      </Button>
      {error && <p role="alert" className="text-sm text-brick">{error}</p>}
    </form>
  );
}
