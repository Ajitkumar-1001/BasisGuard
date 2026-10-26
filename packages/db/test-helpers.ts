import { createDb, type DbHandle } from "./client";
import { resetTestDatabase } from "./reset-test";

export async function openTestDb(): Promise<DbHandle> {
  const h = await createDb(process.env.DATABASE_URL!, { nodeEnv: "test", mode: "fixture" });
  await resetTestDatabase(h.db);
  return h;
}

/**
 * Awaits a promise that must reject and returns the messages of its whole `cause` chain, newline-joined.
 * Drizzle wraps Postgres errors ("Failed query: ..."), so a trigger's message lives on err.cause.
 * Throws if the promise resolves. Framework-free so this module never pulls a test runner into tooling.
 */
export async function rejectionMessages(p: Promise<unknown>): Promise<string> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (err === undefined) throw new Error("expected the promise to reject, but it resolved");
  const messages: string[] = [];
  for (let e: unknown = err; e instanceof Error; e = e.cause) messages.push(e.message);
  return messages.join("\n");
}
