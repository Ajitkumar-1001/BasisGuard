import { Suspense } from "react";
import { ButtonLink } from "@/ui/button";
import { PageHeader } from "@/ui/page-header";
import { RunsList } from "./runs/runs-list";
import { SeededExamples } from "./seeded-examples";

export default function Home() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Research reliability"
        subtitle="Independently checks whether structured research claims are supported by cited evidence. Built on top of Parallel APIs; not a Parallel product."
        actions={
          <>
            <ButtonLink href="/runs/new">New run</ButtonLink>
            <ButtonLink href="/evaluations" variant="secondary">Open evaluations</ButtonLink>
          </>
        }
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Recent runs</h2>
        <RunsList limit={5} />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Seeded examples</h2>
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading seeded examples…</p>}>
          <SeededExamples />
        </Suspense>
      </section>
    </div>
  );
}
