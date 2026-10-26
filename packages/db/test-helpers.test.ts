import { describe, expect, it } from "vitest";
import { rejectionMessages } from "./test-helpers";

describe("rejectionMessages", () => {
  it("returns the messages of the whole cause chain", async () => {
    const err = new Error("Failed query: UPDATE x", { cause: new Error("x is append-only/immutable (UPDATE blocked)") });
    expect(await rejectionMessages(Promise.reject(err))).toBe("Failed query: UPDATE x\nx is append-only/immutable (UPDATE blocked)");
  });

  it("throws when the promise resolves", async () => {
    await expect(rejectionMessages(Promise.resolve(1))).rejects.toThrow(/expected the promise to reject/);
  });
});
