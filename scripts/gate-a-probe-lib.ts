import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { Processor } from "@basisguard/contracts";

export type ProbeArgs = {
  authorized: boolean; companyName: string; officialDomain?: string; asOfDate: string; processor: Processor; timeoutMs: number;
};

export function parseProbeArgs(argv: string[], today: string): ProbeArgs {
  const out: ProbeArgs = { authorized: false, companyName: "Stripe", officialDomain: "stripe.com", asOfDate: today, processor: "base", timeoutMs: 15 * 60_000 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${flag}`);
      return v;
    };
    switch (flag) {
      case "--authorize-paid-one-call": out.authorized = true; break;
      case "--company": out.companyName = next(); break;
      case "--domain": out.officialDomain = next(); break;
      case "--as-of": out.asOfDate = next(); break;
      case "--processor": {
        const p = Processor.safeParse(next());
        if (!p.success) throw new Error(`invalid processor; expected one of ${Processor.options.join(", ")}`);
        out.processor = p.data;
        break;
      }
      case "--timeout-minutes": {
        const raw = next();
        const minutes = Number(raw);
        if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`invalid --timeout-minutes: ${raw} (expected a finite number > 0)`);
        out.timeoutMs = minutes * 60_000;
        break;
      }
      default: throw new Error(`unknown argument: ${flag}`);
    }
  }
  return out;
}

/** Creates `<dir>/probe.lock` exclusively. A second probe is refused until a human deletes the lock. */
export async function acquireProbeLock(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, "probe.lock");
  try {
    const fh = await open(path, "wx");
    await fh.writeFile(`${new Date().toISOString()}\n`);
    await fh.close();
    return path;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Gate A probe already ran (${path} exists); refusing a second paid Task create. Delete the lock only with explicit human authorization.`);
    }
    throw e;
  }
}
