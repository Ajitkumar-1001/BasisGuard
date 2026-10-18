import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FixtureBanner } from "@/ui/banners";
import { FIXTURE_RUN_IDS, getFixtureRun } from "@/ui/fixtures";
import { RunInspector } from "@/ui/run-inspector";

// Seeded examples are synthetic fixtures, so every id is known at build time and fully prerendered.
export function generateStaticParams() {
  return FIXTURE_RUN_IDS.map((id) => ({ id }));
}

// `params` is awaited inside <Suspense> (cacheComponents): listed ids still prerender completely, and the
// route keeps a static shell (banner + fallback) instead of blocking navigation on URL data.
export default function ExampleRunPage({ params }: PageProps<"/examples/runs/[id]">) {
  return (
    <>
      <div className="-mx-4 -mt-6 mb-6 sm:-mx-6">
        <FixtureBanner />
      </div>
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading seeded example…</p>}>
        <ExampleRun params={params} />
      </Suspense>
    </>
  );
}

async function ExampleRun({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getFixtureRun(id);
  if (!view) notFound();
  return <RunInspector view={view} />;
}
