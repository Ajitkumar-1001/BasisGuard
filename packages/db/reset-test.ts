import { sql } from "drizzle-orm";
import { TEST_DATABASE, type Db } from "./client";

export async function resetTestDatabase(db: Db): Promise<void> {
  const rows = (await db.execute(sql`select current_database() as d`)) as unknown as { d: string }[];
  if (rows[0]?.d !== TEST_DATABASE) throw new Error(`resetTestDatabase refuses ${rows[0]?.d}`);
  await db.execute(sql`TRUNCATE usage_events, budget_reservations, run_events, job_queue, research_runs, provider_artifacts RESTART IDENTITY CASCADE`);
}
