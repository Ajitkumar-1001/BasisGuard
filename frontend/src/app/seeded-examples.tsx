import Link from "next/link";
import { listFixtureRuns } from "@/ui/fixtures";
import { RUN_STATUS_META, TONE_CLASSES } from "@/ui/status";
import { StatusBadge } from "@/ui/status-badge";

/** Server-rendered cards for the synthetic fixture runs; always labelled as fixtures. */
export async function SeededExamples() {
  const runs = await listFixtureRuns();
  return (
    <ul className="flex flex-wrap gap-3">
      {runs.map((r) => (
        <li key={r.id} className="min-w-0 grow basis-full rounded-md border border-line bg-panel p-4 sm:basis-1/2 lg:basis-1/3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link className="min-w-0 break-words font-medium text-petrol underline hover:text-petrol-hover" href={`/examples/runs/${r.id}`}>
              {r.company}
            </Link>
            <span className={`rounded-[4px] px-2 py-0.5 text-xs font-medium ${TONE_CLASSES.slate}`}>Synthetic fixture</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{r.policy}</span>
            <StatusBadge meta={RUN_STATUS_META[r.status]} />
          </div>
        </li>
      ))}
    </ul>
  );
}
