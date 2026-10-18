import { createDb, type DbHandle } from "./client";
import { resetTestDatabase } from "./reset-test";

export async function openTestDb(): Promise<DbHandle> {
  const h = await createDb(process.env.DATABASE_URL!, { nodeEnv: "test", mode: "fixture" });
  await resetTestDatabase(h.db);
  return h;
}
