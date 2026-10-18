"use client";

import { useId } from "react";
import type { Claim } from "@/ui/view-models";
import { DASH } from "./format";
import { Icon } from "./icons";
import { ACTION_META, FIELD_STATE_META, REPAIR_META, VERDICT_META } from "./status";
import { StatusBadge } from "./status-badge";
import { TableScroll, Td, Th, Tr } from "./table";

export type OpenClaim = (claim: Claim, origin: HTMLElement) => void;

/** Final verdict, or the FieldState tag for baseline fields (never the raw state code). */
export function ClaimVerdictBadge({ claim }: { claim: Pick<Claim, "finalVerdict" | "fieldState"> }) {
  if (claim.finalVerdict) return <StatusBadge meta={VERDICT_META[claim.finalVerdict]} />;
  if (claim.fieldState) return <StatusBadge meta={FIELD_STATE_META[claim.fieldState]} />;
  return <span className="text-ink-muted">{DASH}</span>;
}

export function ClaimsTable({
  claims,
  unanswered,
  onOpen,
}: {
  claims: Claim[];
  unanswered: string[];
  onOpen: OpenClaim;
}) {
  const unansweredId = useId();

  function onKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, claim: Claim) {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onOpen(claim, e.currentTarget);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Select a row (or focus it and press Enter) to open the claim detail.</p>
      <TableScroll>
        <table className="w-full min-w-[720px] border-collapse">
          <caption className="sr-only">Claims and their automated outcomes</caption>
          <thead>
            <tr>
              <Th>Pointer</Th>
              <Th>Original value</Th>
              <Th>Verdict</Th>
              <Th>Action</Th>
              <Th>Repair</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <Tr
                key={claim.id}
                tabIndex={0}
                className="cursor-pointer focus-visible:bg-petrol-tint focus-visible:outline-offset-[-2px]"
                onClick={(e) => onOpen(claim, e.currentTarget)}
                onKeyDown={(e) => onKeyDown(e, claim)}
              >
                <Td className="num whitespace-nowrap text-xs">{claim.pointer}</Td>
                <Td className="max-w-[18rem] break-words">{claim.originalValue}</Td>
                <Td>
                  <ClaimVerdictBadge claim={claim} />
                </Td>
                <Td>
                  {claim.action ? (
                    <StatusBadge meta={ACTION_META[claim.action]} />
                  ) : (
                    <span className="text-ink-muted">{DASH}</span>
                  )}
                </Td>
                <Td>
                  {claim.repair ? (
                    <StatusBadge meta={REPAIR_META[claim.repair.state]} />
                  ) : (
                    <span className="text-ink-muted">{DASH}</span>
                  )}
                </Td>
                <Td className="w-8 text-ink-muted">
                  <Icon name="chevron-right" />
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {unanswered.length > 0 ? (
        <section aria-labelledby={unansweredId} className="space-y-2">
          <h3 id={unansweredId} className="text-sm font-semibold text-ink">
            Unanswered fields
          </h3>
          <p className="text-sm text-ink-muted">The research task returned no value, so no claim was formed.</p>
          <ul className="space-y-1">
            {unanswered.map((pointer) => (
              <li key={pointer} className="flex flex-wrap items-center gap-2">
                <code className="num text-xs text-ink">{pointer}</code>
                <StatusBadge meta={FIELD_STATE_META.unanswered} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
