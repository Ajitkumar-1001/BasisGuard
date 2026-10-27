import { PageHeader } from "@/ui/page-header";
import { NewRunForm } from "./new-run-form";

export default function NewRunPage() {
  return (
    <section className="mx-auto max-w-xl">
      <PageHeader title="New research run" subtitle="Run the startup facts profile for one company." />
      <NewRunForm />
    </section>
  );
}
