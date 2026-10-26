import { describe, expect, it } from "vitest";
import { truncateHash } from "./hash-util";
import { resolveTabId } from "./tabs-util";

describe("truncateHash", () => {
  it("keeps short values and truncates long ones to 12 chars plus ellipsis", () => {
    expect(truncateHash("abcdef123456")).toBe("abcdef123456");
    expect(truncateHash("abcdef1234567")).toBe("abcdef123456…");
  });
});

describe("resolveTabId", () => {
  const tabs = [{ id: "a" }, { id: "b" }];
  it("uses defaultId when present, else first tab", () => {
    expect(resolveTabId(tabs, "b")).toBe("b");
    expect(resolveTabId(tabs, "zzz")).toBe("a");
    expect(resolveTabId([], "zzz")).toBe("zzz");
  });
});
