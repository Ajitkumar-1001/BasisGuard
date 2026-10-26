import { Icon } from "./icons";
import { TONE_CLASSES, type StatusMeta } from "./status";

export function StatusBadge({ meta, code, codeTestId }: { meta: StatusMeta; code?: string; codeTestId?: string }) {
  const badge = (
    <span
      className={`inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[meta.tone]}`}
    >
      <Icon name={meta.icon} />
      {meta.label}
    </span>
  );
  if (code === undefined) return badge;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {badge}
      <code className="num text-xs text-ink-muted" data-testid={codeTestId}>
        {code}
      </code>
    </span>
  );
}
