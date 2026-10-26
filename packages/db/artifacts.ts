import { and, eq } from "drizzle-orm";
import type { ArtifactKind } from "@basisguard/contracts";
import { contentHash as hashOf } from "@basisguard/core";
import type { DbOrTx } from "./client";
import { providerArtifacts } from "./schema";

/**
 * Content-addressed, append-only artifact insert. Identical canonical content of the same kind
 * returns the existing row (`created: false`); concurrent inserts dedupe on UNIQUE(kind, content_hash).
 * Non-JSON `raw` throws TypeError (from canonicalJson) before any SQL runs.
 */
export async function insertArtifact(
  tx: DbOrTx,
  a: { kind: ArtifactKind; raw: unknown; ownerRunId?: string | null; fixtureOrigin?: string | null },
): Promise<{ id: string; contentHash: string; created: boolean }> {
  const contentHash = hashOf(a.raw);
  const inserted = await tx
    .insert(providerArtifacts)
    .values({ kind: a.kind, rawJson: a.raw, contentHash, ownerRunId: a.ownerRunId ?? null, fixtureOrigin: a.fixtureOrigin ?? null })
    .onConflictDoNothing({ target: [providerArtifacts.kind, providerArtifacts.contentHash] })
    .returning({ id: providerArtifacts.id });
  if (inserted[0]) return { id: inserted[0].id, contentHash, created: true };
  const [existing] = await tx
    .select({ id: providerArtifacts.id })
    .from(providerArtifacts)
    .where(and(eq(providerArtifacts.kind, a.kind), eq(providerArtifacts.contentHash, contentHash)));
  if (!existing) throw new Error("artifact conflict without visible row");
  return { id: existing.id, contentHash, created: false };
}
