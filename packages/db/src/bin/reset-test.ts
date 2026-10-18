import { createDb } from "../client";
import { resetTestDatabase } from "../reset-test";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const h = await createDb(url, { nodeEnv: "test" });
try {
  await resetTestDatabase(h.db);
} finally {
  await h.close();
}
console.log("basisguard_test reset");
