import Link from "next/link";

export default function Home() {
  return (
    <section className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">BasisGuard</h1>
      <p>
        Independently checks whether structured research claims are supported by cited evidence,
        and benchmarks research quality, coverage, latency and cost. Built on top of Parallel APIs;
        not a Parallel product.
      </p>
      <p className="flex gap-4">
        <Link className="text-petrol underline hover:text-petrol-hover" href="/runs/new">Start a research run</Link>
        <Link className="text-petrol underline hover:text-petrol-hover" href="/runs">Browse runs</Link>
      </p>
    </section>
  );
}
