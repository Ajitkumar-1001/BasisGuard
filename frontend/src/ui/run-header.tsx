import type { RunView } from "@/ui/view-models";
import { DASH } from "./format";
import { HashChip } from "./hash-chip";
import { FIELD_STATE_META, RUN_STATUS_META, VERDICT_META, type Tone } from "./status";
import { StatusBadge } from "./status-badge";

type RunHeaderProps = Pick<
  RunView,
  | "company"
  | "domain"
  | "status"
  | "errorCode"
  | "policy"
  | "processor"
  | "mode"
  | "asOfDate"
  | "taskSnapshotHash"
  | "fixtureOrigin"
  | "providerRunId"
  | "claims"
>;

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

const TONE_DOT: Record<Tone, string> = {
  moss: "bg-moss",
  ochre: "bg-ochre",
  brick: "bg-brick",
  plum: "bg-plum",
  slate: "bg-slate",
};

/** One dot per claim, grouped by verdict: this product's own signature element, built only from
 * the same claims the table below renders, so the two can never disagree. */
function VerdictMix({ claims }: { claims: RunView["claims"] }) {
  const buckets = new Map<string, { tone: Tone; count: number }>();
  for (const claim of claims) {
    const meta = claim.finalVerdict ? VERDICT_META[claim.finalVerdict] : claim.fieldState ? FIELD_STATE_META[claim.fieldState] : null;
    if (!meta) continue;
    const entry = buckets.get(meta.label);
    if (entry) entry.count += 1;
    else buckets.set(meta.label, { tone: meta.tone, count: 1 });
  }
  if (buckets.size === 0) return null;
  return (
    <div className="max-w-sm">
      <p className="text-xs font-medium text-ink-muted">Claim verdicts</p>
      <div className="mt-1.5 flex flex-wrap gap-1" aria-hidden="true">
        {[...buckets.entries()].flatMap(([label, { tone, count }]) =>
          Array.from({ length: count }, (_, i) => (
            <span key={`${label}-${i}`} className={`h-2.5 w-2.5 rounded-[2px] ${TONE_DOT[tone]}`} />
          )),
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        {[...buckets.entries()].map(([label, { count }]) => `${count} ${label}`).join(" · ")}
      </p>
    </div>
  );
}

export function RunHeader(props: RunHeaderProps) {
  const {
    company,
    domain,
    status,
    errorCode,
    policy,
    processor,
    mode,
    asOfDate,
    taskSnapshotHash,
    fixtureOrigin,
    providerRunId,
    claims,
  } = props;
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="min-w-0 break-words text-2xl font-semibold text-ink">{company || DASH}</h1>
        {RUN_STATUS_META[status] ? (
          <StatusBadge meta={RUN_STATUS_META[status]} code={status} codeTestId="run-status" />
        ) : (
          <code className="num text-xs text-ink-muted" data-testid="run-status">
            {status}
          </code>
        )}
        {policy === "baseline" ? <StatusBadge meta={FIELD_STATE_META.unverified} code="unverified" /> : null}
        {errorCode ? (
          <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
            Error
            <code className="num rounded-[4px] bg-brick-tint px-1.5 py-0.5 text-brick" data-testid="run-error">
              {errorCode}
            </code>
          </span>
        ) : null}
      </div>
      {domain ? <p className="num break-words text-sm text-ink-muted">{domain}</p> : null}
      <VerdictMix claims={claims} />
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <Meta label="Policy">
          <code className="num">{policy}</code>
        </Meta>
        <Meta label="Processor">
          <code className="num">{processor}</code>
        </Meta>
        <Meta label="Mode">
          <code className="num">{mode ?? DASH}</code>
        </Meta>
        <Meta label="Provider run">
          <code className="num">{providerRunId ?? DASH}</code>
        </Meta>
        <Meta label="As of">
          <span className="num">{asOfDate}</span>
        </Meta>
        <Meta label="Task snapshot">
          {taskSnapshotHash ? <HashChip value={taskSnapshotHash} label="Task snapshot hash" /> : DASH}
        </Meta>
        {fixtureOrigin ? (
          <Meta label="Fixture origin">
            <code className="num">{fixtureOrigin}</code>
          </Meta>
        ) : null}
      </dl>
    </header>
  );
}
