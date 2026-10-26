import { HashChip } from "@/ui/hash-chip";
import { TableScroll, Td, Th, Tr } from "@/ui/table";
import type { EvalCase } from "@/ui/view-models";

function Triple({ counts }: { counts: EvalCase["b"] }) {
  return (
    <span className="num whitespace-nowrap">
      {counts.accept} / {counts.abstain} / {counts.review}
    </span>
  );
}

/** Paired A/B/C experiment matrix: one row per case, A unverified count beside B and C accept/abstain/review. */
export function AbcMatrix({ cases }: { cases: EvalCase[] }) {
  return (
    <TableScroll>
      <table className="w-full min-w-[960px] border-collapse">
        <caption className="sr-only">Paired A, B and C results per case</caption>
        <thead>
          <tr>
            <Th>Case</Th>
            <Th>Kind</Th>
            <Th numeric>A Unverified</Th>
            <Th>B accept / abstain / review</Th>
            <Th>C accept / abstain / review</Th>
            <Th>B initial</Th>
            <Th>C initial</Th>
            <Th>C post-repair</Th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <Tr key={c.id}>
              <Td>
                <span className="font-medium">{c.company}</span>
                <span className="num block text-xs text-ink-muted">{c.id}</span>
              </Td>
              <Td>
                {c.kind}
                {c.perturbation ? <span className="block text-xs text-ink-muted">{c.perturbation}</span> : null}
              </Td>
              <Td numeric>{c.aUnverified}</Td>
              <Td>
                <Triple counts={c.b} />
              </Td>
              <Td>
                <Triple counts={c.c} />
              </Td>
              <Td>
                <HashChip value={c.bInitialHash} label={`B initial hash for ${c.company}`} />
              </Td>
              <Td>
                <HashChip value={c.cInitialHash} label={`C initial hash for ${c.company}`} />
              </Td>
              <Td>
                <HashChip value={c.cPostRepair} label={`C post-repair hash for ${c.company}`} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}
