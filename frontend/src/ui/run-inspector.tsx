"use client";

import { useRef, useState } from "react";
import type { RunStatus } from "@basisguard/contracts";
import type { ReviewDecision } from "@/ui/types";
import type { BasisEntry, Claim, Evidence, ReviewEntry, RunEvent, RunView } from "@/ui/view-models";
import { Callout } from "./banners";
import { CitationItem, ClaimDrawer, REPAIR_ONCE_NOTE, UpstreamTag } from "./claim-drawer";
import { ClaimsTable, type OpenClaim } from "./claims-table";
import { DASH, formatAt, formatCount, formatLatency, formatUsd } from "./format";
import { HashChip } from "./hash-chip";
import { RunHeader } from "./run-header";
import { FIELD_STATE_META, REPAIR_META, REVIEW_META, VERDICT_META } from "./status";
import { StatusBadge } from "./status-badge";
import { EmptyState, ErrorState } from "./states";
import { TableScroll, Td, Th, Tr } from "./table";
import { Tabs, type TabDef } from "./tabs";

const IN_PROGRESS: ReadonlySet<RunStatus> = new Set(["queued", "submitting", "researching", "verifying", "repairing"]);

type LocalReviews = Record<string, ReviewEntry[]>;

function evidenceFor(claim: Claim, evidence: Evidence[]): Evidence[] {
  const ids = new Set([...claim.judgeEvidenceIds, ...(claim.repair?.evidenceIds ?? [])]);
  return evidence.filter((e) => ids.has(e.id));
}

function StatStrip({ view }: { view: RunView }) {
  const stats: { label: string; value: string }[] = [
    { label: "Provider calls", value: formatCount(view.providerCalls) },
    { label: "Extract URL units", value: formatCount(view.extractUrlUnits) },
    { label: "Estimated spend", value: formatUsd(view.spendEstimatedUsd) },
    { label: "Reported spend", value: formatUsd(view.spendReportedUsd) },
    { label: "Latency", value: formatLatency(view.latencyMs) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="min-w-0 rounded-md border border-line bg-panel px-4 py-3">
          <dt className="text-xs font-medium text-ink-muted">{s.label}</dt>
          <dd className="num mt-1 break-words text-base text-ink">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PanelHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function TaskOriginalPanel({ policy, taskOutput }: Pick<RunView, "policy" | "taskOutput">) {
  return (
    <div>
      <PanelHeading title="Task Original">
        <StatusBadge meta={FIELD_STATE_META.unverified} code={policy === "baseline" ? "unverified" : undefined} />
      </PanelHeading>
      <p className="mb-3 text-sm text-ink-muted">The research task output exactly as returned, before any checks.</p>
      {taskOutput === null || taskOutput === undefined ? (
        <EmptyState title="No Task output yet" body="The research task has not returned output for this run." />
      ) : (
        <pre
          data-testid="task-content"
          className="num max-h-[32rem] overflow-auto rounded-md border border-line bg-sunken p-3 text-xs text-ink"
        >
          {JSON.stringify(taskOutput, null, 2)}
        </pre>
      )}
    </div>
  );
}

function BasisPanel({ basis }: { basis: BasisEntry[] }) {
  return (
    <div>
      <PanelHeading title="Native Research Basis">
        <UpstreamTag />
      </PanelHeading>
      {basis.length === 0 ? (
        <EmptyState
          title="No research basis recorded"
          body="The research task returned no per-field reasoning or citations for this run."
        />
      ) : (
        <ul className="space-y-3">
          {basis.map((b, i) => (
            <li key={`${b.field}-${i}`} className="space-y-2 rounded-md border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="num text-xs font-medium text-ink">{b.field}</code>
                <span className="text-xs text-ink-muted">
                  Confidence <span className="num text-ink">{b.confidence ?? DASH}</span>
                </span>
                <UpstreamTag />
              </div>
              {b.reasoning ? <p className="text-sm text-ink">{b.reasoning}</p> : null}
              {b.citations.length > 0 ? (
                <ul className="space-y-2">
                  {b.citations.map((c, j) => (
                    <CitationItem key={`${c.url}-${j}`} citation={c} />
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JudgePanel({ claims }: { claims: Claim[] }) {
  const judged = claims.filter((c) => c.initialVerdict !== null);
  if (judged.length === 0) {
    return (
      <EmptyState
        title="No judge verdicts"
        body="The initial judge arrives with claim verification in Phase 2; baseline runs skip it."
      />
    );
  }
  return (
    <div>
      <PanelHeading title="Initial Judge" />
      <TableScroll>
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <Th>Pointer</Th>
              <Th>Initial verdict</Th>
              <Th>Evidence IDs</Th>
              <Th>Explanation</Th>
            </tr>
          </thead>
          <tbody>
            {judged.map((c) => (
              <Tr key={c.id}>
                <Td className="num whitespace-nowrap text-xs">{c.pointer}</Td>
                <Td>{c.initialVerdict ? <StatusBadge meta={VERDICT_META[c.initialVerdict]} /> : DASH}</Td>
                <Td className="num text-xs">
                  {c.judgeEvidenceIds.length > 0 ? c.judgeEvidenceIds.join(", ") : DASH}
                </Td>
                <Td className="text-ink-muted">{c.judgeExplanation ?? DASH}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function RepairPanel({ claims }: { claims: Claim[] }) {
  const repaired = claims.filter((c) => c.repair !== null);
  if (repaired.length === 0) {
    return (
      <EmptyState
        title="No repair history"
        body="Automatic repair runs after verification (Phase 2) and only under the verify_and_repair policy."
      />
    );
  }
  return (
    <div>
      <PanelHeading title="Automatic Repair History" />
      <p className="mb-3 text-sm text-ink-muted">{REPAIR_ONCE_NOTE}</p>
      <TableScroll>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <Th>Pointer</Th>
              <Th>Repair</Th>
              <Th>Post-repair verdict</Th>
              <Th>Bundle hash</Th>
              <Th>At</Th>
            </tr>
          </thead>
          <tbody>
            {repaired.map((c) =>
              c.repair ? (
                <Tr key={c.id}>
                  <Td className="num whitespace-nowrap text-xs">{c.pointer}</Td>
                  <Td>
                    <StatusBadge meta={REPAIR_META[c.repair.state]} />
                  </Td>
                  <Td>{c.repair.postVerdict ? <StatusBadge meta={VERDICT_META[c.repair.postVerdict]} /> : DASH}</Td>
                  <Td>
                    {c.repair.bundleHash ? <HashChip value={c.repair.bundleHash} label="repair bundle hash" /> : DASH}
                  </Td>
                  <Td className="num whitespace-nowrap text-xs">{formatAt(c.repair.at)}</Td>
                </Tr>
              ) : null,
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function ReviewPanel({ claims, localReviews }: { claims: Claim[]; localReviews: LocalReviews }) {
  const rows = claims.flatMap((c) => [
    ...c.reviews.map((r, i) => ({ key: `${c.id}-s${i}`, pointer: c.pointer, entry: r, local: false })),
    ...(localReviews[c.id] ?? []).map((r, i) => ({ key: `${c.id}-l${i}`, pointer: c.pointer, entry: r, local: true })),
  ]);
  return (
    <div>
      <PanelHeading title="Manual Review" />
      <p className="mb-3 text-sm text-ink-muted">Append-only: reviews never change automated verdicts.</p>
      {rows.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          body="Open a claim in Claims & Evidence to add a review. Reviews are appended and never edit a verdict."
        />
      ) : (
        <TableScroll>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <Th>Pointer</Th>
                <Th>Decision</Th>
                <Th>Reviewer</Th>
                <Th>At</Th>
                <Th>Rationale</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.key}>
                  <Td className="num whitespace-nowrap text-xs">{r.pointer}</Td>
                  <Td>
                    <StatusBadge meta={REVIEW_META[r.entry.decision]} />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {r.entry.alias}
                    {r.local ? <span className="ml-2 text-xs text-ink-muted">(this tab only)</span> : null}
                  </Td>
                  <Td className="num whitespace-nowrap text-xs">{formatAt(r.entry.at)}</Td>
                  <Td>{r.entry.rationale}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}

function DebugPanel({ events }: { events: RunEvent[] }) {
  return (
    <div>
      <PanelHeading title="Raw Debug">
        <span className="rounded-[4px] bg-slate-tint px-1.5 py-0.5 text-xs font-medium text-slate">Local only</span>
      </PanelHeading>
      {events.length === 0 ? (
        <EmptyState title="No events recorded" body="The run has not written any events yet." />
      ) : (
        <TableScroll>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <Th>At</Th>
                <Th>Event</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <Tr key={`${e.at}-${i}`}>
                  <Td className="num whitespace-nowrap text-xs">{formatAt(e.at)}</Td>
                  <Td className="num whitespace-nowrap text-xs">{e.kind}</Td>
                  <Td className="break-words">{e.detail}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}

export function RunInspector({ view }: { view: RunView }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localReviews, setLocalReviews] = useState<LocalReviews>({});
  const originRef = useRef<HTMLElement | null>(null);

  const selected = selectedId === null ? null : (view.claims.find((c) => c.id === selectedId) ?? null);

  const openClaim: OpenClaim = (claim, origin) => {
    originRef.current = origin;
    setSelectedId(claim.id);
  };

  function closeClaim() {
    setSelectedId(null);
    originRef.current?.focus();
  }

  function addReview(claimId: string, decision: ReviewDecision) {
    const entry: ReviewEntry = {
      decision,
      alias: "you",
      at: new Date().toISOString(),
      rationale: "Prototype: stored in this tab only",
    };
    setLocalReviews((prev) => ({ ...prev, [claimId]: [...(prev[claimId] ?? []), entry] }));
  }

  const tabs: TabDef[] = [
    {
      id: "task-original",
      label: "Task Original",
      content: <TaskOriginalPanel policy={view.policy} taskOutput={view.taskOutput} />,
    },
    { id: "basis", label: "Native Research Basis", content: <BasisPanel basis={view.nativeBasis} /> },
    {
      id: "claims",
      label: "Claims & Evidence",
      content:
        view.claims.length > 0 ? (
          <div>
            <PanelHeading title="Claims & Evidence" />
            <ClaimsTable claims={view.claims} unanswered={view.unanswered} onOpen={openClaim} />
          </div>
        ) : (
          <EmptyState
            title="Claim verification arrives in Phase 2"
            body="This run has no claim rows yet. Claims are formed and judged by the verification phase."
          />
        ),
    },
    { id: "judge", label: "Initial Judge", content: <JudgePanel claims={view.claims} /> },
    { id: "repair", label: "Automatic Repair History", content: <RepairPanel claims={view.claims} /> },
    { id: "review", label: "Manual Review", content: <ReviewPanel claims={view.claims} localReviews={localReviews} /> },
    { id: "debug", label: "Raw Debug", content: <DebugPanel events={view.events} /> },
  ];

  return (
    <div className="space-y-6">
      <RunHeader
        company={view.company}
        domain={view.domain}
        status={view.status}
        errorCode={view.errorCode}
        policy={view.policy}
        processor={view.processor}
        mode={view.mode}
        asOfDate={view.asOfDate}
        taskSnapshotHash={view.taskSnapshotHash}
        fixtureOrigin={view.fixtureOrigin}
      />
      <StatStrip view={view} />
      {IN_PROGRESS.has(view.status) ? (
        <Callout tone="slate">Run in progress — results appear when the run is terminal</Callout>
      ) : null}
      {view.status === "failed" ? (
        <ErrorState
          title="Run failed"
          code={view.errorCode ?? undefined}
          body="The run stopped before it finished. Runs are never restarted; start a new run instead."
        />
      ) : null}
      <Tabs tabs={tabs} defaultId={view.claims.length > 0 ? "claims" : "task-original"} label="Run inspection" />
      {selected ? (
        <ClaimDrawer
          key={selected.id}
          claim={selected}
          evidence={evidenceFor(selected, view.evidence)}
          localReviews={localReviews[selected.id] ?? []}
          onReview={(decision) => addReview(selected.id, decision)}
          onClose={closeClaim}
        />
      ) : null}
    </div>
  );
}
