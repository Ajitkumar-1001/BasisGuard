import { Suspense } from "react";
import { ButtonLink } from "@/ui/button";
import { PageHeader } from "@/ui/page-header";
import { SeededExamples } from "../seeded-examples";
import { RunsList } from "./runs-list";

export default function RunsPage() {
  return (
    <div className="space-y-10">
      <section>
        <PageHeader title="Runs" actions={<ButtonLink href="/runs/new">New run</ButtonLink>} />
        <RunsList />
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
