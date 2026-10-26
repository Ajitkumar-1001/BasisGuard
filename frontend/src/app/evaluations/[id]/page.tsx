import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AbcMatrix } from "@/ui/abc-matrix";
import { FixtureBanner, PreviewBanner } from "@/ui/banners";
import { Button } from "@/ui/button";
import { EVALUATION_IDS, getEvaluation } from "@/ui/fixtures";
import { formatAt, formatUsd } from "@/ui/format";
import { HashChip } from "@/ui/hash-chip";
import { MetricCard } from "@/ui/metric-card";
import { PageHeader } from "@/ui/page-header";
import { EVAL_STATUS_META } from "@/ui/status";
import { StatusBadge } from "@/ui/status-badge";
import { TableScroll, Td, Th, Tr } from "@/ui/table";
import type { EvalMetric, EvaluationView } from "@/ui/view-models";

// Evaluations are synthetic fixtures, so every id is known at build time and fully prerendered.
export function generateStaticParams() {
  return EVALUATION_IDS.map((id) => ({ id }));
}

// `params` is awaited inside <Suspense> (cacheComponents), as in the seeded example run page.
export default function EvaluationPage({ params }: PageProps<"/evaluations/[id]">) {
  return (
    <>
      <div className="-mx-4 mb-6 sm:-mx-6">
        <FixtureBanner />
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading evaluation…</p>}>
        <Evaluation params={params} />
      </Suspense>
    </>
  );
}

async function Evaluation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getEvaluation(id);
  if (!view) notFound();
  return <EvaluationBody view={view} />;
}

function MetricSection({ title, metrics }: { title: string; metrics: EvalMetric[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold text-ink">{title}</h2>
      <div className="flex flex-wrap gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0 grow basis-full sm:basis-1/2 lg:basis-1/3">
            <MetricCard
              label={m.label}
              value={String(m.numerator)}
              numerator={m.numerator}
              denominator={m.denominator}
              footnote={`missing labels ${m.missingLabels} · errors ${m.errors} · natural ${m.natural.numerator}/${m.natural.denominator} · synthetic ${m.synthetic.numerator}/${m.synthetic.denominator}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function EvaluationBody({ view }: { view: EvaluationView }) {
  return (
    <div>
      {view.preview ? (
        <div className="-mx-4 mb-6 sm:-mx-6">
          <PreviewBanner />
        </div>
      ) : null}
      <PageHeader title={`Evaluation ${view.datasetVersion}`} actions={<StatusBadge meta={EVAL_STATUS_META[view.status]} />} />
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-2">
          Snapshot <HashChip value={view.snapshotHash} label="snapshot hash" />
        </span>
        <span className="inline-flex items-center gap-2">
          Manifest <HashChip value={view.manifestHash} label="manifest hash" />
        </span>
      </div>

      <section className="rounded-md border border-line bg-panel p-4">
        <h2 className="mb-3 text-base font-semibold text-ink">Label readiness</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-ink-muted">Truth labels</dt>
            <dd className="mt-1 text-ink">{view.truthLabels}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted">Support labels</dt>
            <dd className="num mt-1 text-ink">
              {view.supportLabelsDone} / {view.supportLabelsTotal}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-muted">Post-repair label queue</dt>
            <dd className="num mt-1 text-ink">{view.repairLabelQueue}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-base font-semibold text-ink">Paired A/B/C results</h2>
        <p className="mb-3 text-sm text-ink-muted">
          A is unverified: its raw non-null values are counted as accepted for accuracy scoring only.
        </p>
        <AbcMatrix cases={view.cases} />
      </section>

      <MetricSection title="Initial judge (B)" metrics={view.initialMetrics} />
      <MetricSection title="Post-repair (C)" metrics={view.repairMetrics} />

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-panel p-4">
          <h2 className="text-base font-semibold text-ink">Actual spend</h2>
          <p className="num mt-2 text-2xl font-semibold text-ink">{formatUsd(view.spendActualUsd)}</p>
        </div>
        <div className="rounded-md border border-line bg-panel p-4">
          <h2 className="text-base font-semibold text-ink">Attributed policy cost (comparison only)</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.spendAttributed.map((s) => (
              <li key={s.policy} className="flex justify-between gap-4">
                <span className="text-ink-muted">{s.policy}</span>
                <span className="num text-ink">{formatUsd(s.usd)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-ink">Event log</h2>
        <TableScroll>
          <table className="w-full min-w-[640px] border-collapse">
            <caption className="sr-only">Evaluation events</caption>
            <thead>
              <tr>
                <Th>At</Th>
                <Th>Event</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {view.events.map((e, i) => (
                <Tr key={`${e.at}-${i}`}>
                  <Td className="num whitespace-nowrap text-xs">{formatAt(e.at)}</Td>
                  <Td className="num whitespace-nowrap text-xs">{e.kind}</Td>
                  <Td className="break-words">{e.detail}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {view.preview ? (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button disabled aria-describedby="export-help">
            Export report
          </Button>
          <p id="export-help" className="text-sm text-ink-muted">
            Export blocked until labels are certified
          </p>
        </div>
      ) : null}
    </div>
  );
}
