import { migrateDatabase } from "../../packages/db/migrate";
import { TEST_DATABASE_URL } from "../../vitest.config";

export default async function setup(): Promise<void> {
  await migrateDatabase(TEST_DATABASE_URL);
}
