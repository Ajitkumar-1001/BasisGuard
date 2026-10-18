import type { RunView } from "@/ui/view-models";
import { DASH } from "./format";
import { HashChip } from "./hash-chip";
import { FIELD_STATE_META, RUN_STATUS_META } from "./status";
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
>;

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

export function RunHeader(props: RunHeaderProps) {
  const { company, domain, status, errorCode, policy, processor, mode, asOfDate, taskSnapshotHash, fixtureOrigin } =
    props;
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="min-w-0 break-words text-2xl font-semibold text-ink">{company || DASH}</h1>
        <StatusBadge meta={RUN_STATUS_META[status]} code={status} codeTestId="run-status" />
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
