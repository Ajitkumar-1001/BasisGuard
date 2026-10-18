import { NewRunForm } from "./new-run-form";

export default function NewRunPage() {
  return (
    <section className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New research run</h1>
      <NewRunForm />
    </section>
  );
}
