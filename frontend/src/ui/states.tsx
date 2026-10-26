import { Icon } from "./icons";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-panel p-8 text-center">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-prose text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, code, body }: { title: string; code?: string; body: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-6" role="alert">
      <div className="flex items-center gap-2 text-brick">
        <Icon name="x" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {code ? <code className="num mt-2 block text-xs text-ink-muted">{code}</code> : null}
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
    </div>
  );
}
