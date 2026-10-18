import { ButtonLink } from "@/ui/button";
import { EmptyState } from "@/ui/states";

export default function ExampleRunNotFound() {
  return (
    <EmptyState
      title="Seeded example not found"
      body="No seeded example run matches this address."
      action={
        <ButtonLink href="/runs" variant="secondary">
          Back to runs
        </ButtonLink>
      }
    />
  );
}
