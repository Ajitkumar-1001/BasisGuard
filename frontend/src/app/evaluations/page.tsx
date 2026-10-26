import Link from "next/link";
import { FixtureBanner } from "@/ui/banners";
import { listEvaluations } from "@/ui/fixtures";
import { PageHeader } from "@/ui/page-header";
import { EVAL_STATUS_META, TONE_CLASSES } from "@/ui/status";
import { StatusBadge } from "@/ui/status-badge";
import { TableScroll, Td, Th, Tr } from "@/ui/table";

export default async function EvaluationsPage() {
  const evaluations = await listEvaluations();
  return (
    <>
      <div className="-mx-4 -mt-6 mb-6 sm:-mx-6">
        <FixtureBanner />
      </div>
      <PageHeader title="Evaluations" />
      <TableScroll>
        <table className="w-full min-w-[560px] border-collapse">
          <caption className="sr-only">Evaluations</caption>
          <thead>
            <tr>
              <Th>Dataset version</Th>
              <Th>Status</Th>
              <Th numeric>Natural cases</Th>
              <Th numeric>Perturbed cases</Th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((e) => (
              <Tr key={e.id}>
                <Td>
                  <Link className="font-medium text-petrol underline hover:text-petrol-hover" href={`/evaluations/${e.id}`}>
                    {e.datasetVersion}
                  </Link>
                  {e.preview ? (
                    <span className={`ml-2 rounded-[4px] px-1.5 py-0.5 text-xs font-medium ${TONE_CLASSES.ochre}`}>Preview</span>
                  ) : null}
                </Td>
                <Td>
                  <StatusBadge meta={EVAL_STATUS_META[e.status]} />
                </Td>
                <Td numeric>{e.casesNatural}</Td>
                <Td numeric>{e.casesPerturbed}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </>
  );
}
