import { ButtonLink } from "@/ui/button";
import { EmptyState } from "@/ui/states";

export default function EvaluationNotFound() {
  return (
    <EmptyState
      title="Evaluation not found"
      body="No evaluation matches this address."
      action={
        <ButtonLink href="/evaluations" variant="secondary">
          Back to evaluations
        </ButtonLink>
      }
    />
  );
}
