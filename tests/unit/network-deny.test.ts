import net from "node:net";
import { describe, expect, it } from "vitest";

function chain(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e; cur; cur = (cur as { cause?: unknown }).cause) parts.push(String(cur));
  return parts.join(" <- ");
}

describe("network deny harness", () => {
  it("blocks raw sockets to non-loopback hosts", () => {
    expect(() => net.connect(443, "example.com")).toThrow(/network deny/);
  });

  it("blocks fetch to the public internet", async () => {
    const err = await fetch("https://example.com").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(chain(err)).toMatch(/network deny/);
  });

  it("allows loopback sockets", async () => {
    const server = net.createServer((s) => s.end());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as net.AddressInfo;
    await new Promise<void>((resolve, reject) => {
      const c = net.connect(port, "127.0.0.1", () => { c.end(); resolve(); });
      c.on("error", reject);
    });
    await new Promise<void>((r) => server.close(() => r()));
  });
});
