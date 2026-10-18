import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RuntimeMode } from "@basisguard/contracts";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export type DbHandle = { db: Db; databaseName: string; close(): Promise<void> };
export type DbGuardOptions = { mode?: RuntimeMode; nodeEnv?: string };

export const TEST_DATABASE = "basisguard_test";

/** PRD §2.1 + D-006: tests and fixture mode may only touch basisguard_test (checked post-connect). */
export function assertDatabaseAllowed(name: string, opts: DbGuardOptions): void {
  if ((opts.nodeEnv === "test" || opts.mode === "fixture") && name !== TEST_DATABASE) {
    throw new Error(`refusing database "${name}": NODE_ENV=test / fixture mode may only use ${TEST_DATABASE}`);
  }
}

export async function createDb(url: string, opts: DbGuardOptions): Promise<DbHandle> {
  const client = postgres(url, { max: 5, onnotice: () => {} });
  try {
    const rows = await client<{ current_database: string }[]>`select current_database()`;
    const databaseName = rows[0]!.current_database;
    assertDatabaseAllowed(databaseName, opts);
    return { db: drizzle(client, { schema }), databaseName, close: () => client.end() };
  } catch (e) {
    // A failing close must not replace the guard/connect error the caller needs to see.
    await client.end().catch(() => {});
    throw e;
  }
}
