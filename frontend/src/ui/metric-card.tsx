export function MetricCard({
  label,
  value,
  numerator,
  denominator,
  footnote,
}: {
  label: string;
  value: string;
  numerator: number;
  denominator: number;
  footnote?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="num mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="num mt-1 text-sm text-ink-muted">
        {numerator} / {denominator}
      </p>
      {footnote ? <p className="mt-2 text-xs text-ink-muted">{footnote}</p> : null}
    </div>
  );
}
