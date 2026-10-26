"use client";

import { useEffect, useId, useRef } from "react";
import type { ReviewDecision } from "@/ui/types";
import type { Citation, Claim, Evidence, ReviewEntry } from "@/ui/view-models";
import { Button } from "./button";
import { ClaimVerdictBadge } from "./claims-table";
import { DASH, formatAt, httpsUrl } from "./format";
import { HashChip } from "./hash-chip";
import { Icon } from "./icons";
import { ACTION_META, REPAIR_META, REVIEW_META, VERDICT_META } from "./status";
import { StatusBadge } from "./status-badge";

export const REPAIR_ONCE_NOTE = "Repair runs once automatically; there is no manual retry.";

export function UpstreamTag() {
  return (
    <span className="rounded-[4px] border border-line px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted">
      upstream metadata
    </span>
  );
}

/** Citation link: only https URLs become links, always in a new tab without opener access. */
export function SourceLink({ url, title }: { url: string; title?: string }) {
  const safe = httpsUrl(url);
  if (!safe) {
    return (
      <span className="break-words text-sm text-ink-muted">
        {title ? `${title} · ` : ""}
        <code className="num break-all text-xs">{url}</code> (not linked: not https)
      </span>
    );
  }
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-start gap-1 break-all text-sm text-petrol underline underline-offset-2 hover:text-petrol-hover"
    >
      <span className="min-w-0">{title ?? safe}</span>
      <Icon name="external" className="mt-0.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function CitationItem({ citation }: { citation: Citation }) {
  return (
    <li className="space-y-1">
      <SourceLink url={citation.url} title={citation.title} />
      {citation.title ? <p className="num break-all text-xs text-ink-muted">{citation.url}</p> : null}
      {citation.excerpt ? (
        <blockquote className="border-l-2 border-line pl-3 text-sm text-ink">{citation.excerpt}</blockquote>
      ) : null}
    </li>
  );
}

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  return (
    <li className="space-y-1 rounded-md border border-line p-3">
      <code className="num text-xs text-ink">{evidence.id}</code>
      <div>
        <SourceLink url={evidence.url} />
      </div>
      <blockquote className="border-l-2 border-line pl-3 text-sm text-ink">{evidence.excerpt}</blockquote>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        Content hash <HashChip value={evidence.contentHash} label={`content hash of ${evidence.id}`} />
      </div>
    </li>
  );
}

function EvidenceIds({ ids, evidence }: { ids: string[]; evidence: Evidence[] }) {
  if (ids.length === 0) return <p className="text-sm text-ink-muted">No evidence IDs recorded.</p>;
  return (
    <ul className="space-y-2">
      {ids.map((id) => {
        const row = evidence.find((e) => e.id === id);
        return row ? (
          <EvidenceItem key={id} evidence={row} />
        ) : (
          <li key={id}>
            <code className="num text-xs text-ink">{id}</code>
            <span className="text-xs text-ink-muted"> (no evidence row)</span>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t border-line px-5 py-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function ReviewItem({ entry, local }: { entry: ReviewEntry; local: boolean }) {
  return (
    <li className="space-y-1 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge meta={REVIEW_META[entry.decision]} />
        <span className="text-xs text-ink">{entry.alias}</span>
        <span className="num text-xs text-ink-muted">{formatAt(entry.at)}</span>
        {local ? (
          <span className="rounded-[4px] bg-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">This tab only</span>
        ) : null}
      </div>
      <p className="text-sm text-ink">{entry.rationale}</p>
    </li>
  );
}

const REVIEW_BUTTONS: { decision: ReviewDecision; label: string }[] = [
  { decision: "approved", label: "Approve" },
  { decision: "rejected", label: "Reject" },
  { decision: "needs_followup", label: "Needs follow-up" },
];

export function ClaimDrawer({
  claim,
  evidence,
  localReviews,
  onReview,
  onClose,
}: {
  claim: Claim;
  /** Evidence rows referenced by this claim's judge or repair evidence IDs. */
  evidence: Evidence[];
  localReviews: ReviewEntry[];
  onReview: (decision: ReviewDecision) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open as a modal once per selected claim; the guard covers StrictMode's double effect run.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [claim.id]);

  // Every close path (button, Esc) closes the dialog first, so the native `close`
  // event reaches the parent after the page is no longer inert and focus can return.
  function requestClose() {
    const dialog = ref.current;
    if (dialog?.open) dialog.close();
  }

  const { repair } = claim;
  const showInitial = claim.initialVerdict !== null && claim.initialVerdict !== claim.finalVerdict;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClose={onClose}
      className="mt-0 mb-0 mr-0 ml-auto h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-panel p-0 text-ink backdrop:bg-ink/40 lg:w-[480px] lg:border-l lg:border-line"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-panel px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted">Claim detail</p>
          <h2 id={titleId} className="num break-all text-base font-semibold text-ink">
            {claim.pointer}
          </h2>
        </div>
        <Button variant="ghost" onClick={requestClose} aria-label="Close claim detail">
          <Icon name="x" />
        </Button>
      </div>

      <Section title="Claim tested">
        <p className="text-sm text-ink">{claim.template}</p>
      </Section>

      <Section title="Original value (untouched)">
        <pre className="num overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-sunken p-3 text-xs text-ink">
          {claim.originalValue}
        </pre>
      </Section>

      <Section title="Citations">
        {claim.citations.length > 0 ? (
          <ul className="space-y-3">
            {claim.citations.map((c, i) => (
              <CitationItem key={`${c.url}-${i}`} citation={c} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">The research task cited no sources for this field.</p>
        )}
      </Section>

      <Section title="Upstream confidence">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num text-sm text-ink">{claim.upstreamConfidence ?? DASH}</span>
          <UpstreamTag />
        </div>
        <p className="text-xs text-ink-muted">Reported by the research provider; BasisGuard does not use it as evidence.</p>
      </Section>

      <Section title="Verdict">
        <div className="flex flex-wrap items-center gap-2">
          <ClaimVerdictBadge claim={claim} />
          {claim.action ? <StatusBadge meta={ACTION_META[claim.action]} /> : null}
        </div>
        {claim.fieldState ? (
          <p className="text-sm text-ink-muted">Baseline runs skip the judge; this value was not checked.</p>
        ) : null}
        {showInitial && claim.initialVerdict ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            Initial verdict <StatusBadge meta={VERDICT_META[claim.initialVerdict]} />
          </p>
        ) : null}
        {claim.judgeExplanation ? <p className="text-sm text-ink">{claim.judgeExplanation}</p> : null}
        {claim.fieldState ? null : (
          <>
            <h4 className="pt-1 text-xs font-medium text-ink-muted">Judge evidence</h4>
            <EvidenceIds ids={claim.judgeEvidenceIds} evidence={evidence} />
          </>
        )}
      </Section>

      <Section title="Automatic repair">
        {repair ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge meta={REPAIR_META[repair.state]} />
              <span className="num text-xs text-ink-muted">{formatAt(repair.at)}</span>
            </div>
            {repair.postVerdict ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                Post-repair verdict <StatusBadge meta={VERDICT_META[repair.postVerdict]} />
              </p>
            ) : null}
            {repair.bundleHash ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                Bundle hash <HashChip value={repair.bundleHash} label="repair bundle hash" />
              </p>
            ) : null}
            {repair.evidenceIds.length > 0 ? <EvidenceIds ids={repair.evidenceIds} evidence={evidence} /> : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No repair attempt recorded for this claim.</p>
        )}
        <p className="text-xs text-ink-muted">{REPAIR_ONCE_NOTE}</p>
      </Section>

      <Section title="Review history">
        <p className="text-xs text-ink-muted">Append-only: reviews never change automated verdicts.</p>
        {claim.reviews.length + localReviews.length > 0 ? (
          <ol className="space-y-2">
            {claim.reviews.map((r, i) => (
              <ReviewItem key={`stored-${i}`} entry={r} local={false} />
            ))}
            {localReviews.map((r, i) => (
              <ReviewItem key={`local-${i}`} entry={r} local />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No reviews yet.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {REVIEW_BUTTONS.map((b) => (
            <Button key={b.decision} variant="secondary" onClick={() => onReview(b.decision)}>
              {b.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-ink-muted">Prototype: added reviews are stored in this tab only.</p>
      </Section>
    </dialog>
  );
}
