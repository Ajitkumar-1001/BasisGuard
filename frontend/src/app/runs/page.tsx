import { RunsList } from "./runs-list";

export default function RunsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Runs</h1>
      <RunsList />
    </section>
  );
}
