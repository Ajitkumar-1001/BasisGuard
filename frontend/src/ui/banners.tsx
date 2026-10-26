import { Icon } from "./icons";
import { TONE_CLASSES, type Tone } from "./status";

export function PreviewBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-line bg-ochre-tint px-4 py-2 text-sm font-medium text-ochre"
    >
      <Icon name="alert" />
      NOT HUMAN-REVIEWED — DO NOT QUOTE
    </div>
  );
}

export function FixtureBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-slate-tint px-4 py-2 text-sm font-medium text-slate">
      <Icon name="dash" />
      Seeded fixture · synthetic example — not real Parallel output
    </div>
  );
}

export function Callout({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <div className={`rounded-md px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}>{children}</div>;
}
