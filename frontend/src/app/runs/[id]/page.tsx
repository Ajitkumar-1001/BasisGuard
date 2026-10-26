import { Suspense } from "react";
import { RunView } from "./run-view";

// The page itself never awaits params; the dynamic part streams behind the Suspense fallback (cacheComponents).
export default function RunPage(props: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading run…</p>}>
      <RunLoader params={props.params} />
    </Suspense>
  );
}

async function RunLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunView runId={id} />;
}
