import { describe, expect, it } from "vitest";
import { guardApiRequest } from "./http";

const req = (headers: Record<string, string>, method = "POST", url = "http://127.0.0.1:3100/api/runs") =>
  new Request(url, { method, headers, ...(method === "POST" ? { body: "{}" } : {}) });
const json = { "content-type": "application/json" };
const status = (r: Response | null) => r?.status ?? null;
const code = async (r: Response | null) => (r ? ((await r.json()) as { code: string }).code : null);

describe("guardApiRequest: state-changing requests (CSRF)", () => {
  it("passes a same-origin browser POST and a header-less local client POST", () => {
    expect(guardApiRequest(req({ ...json, host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100", "sec-fetch-site": "same-origin" }), "rid", { stateChanging: true })).toBeNull();
    expect(guardApiRequest(req({ ...json, host: "localhost:3100" }), "rid", { stateChanging: true })).toBeNull();
    expect(guardApiRequest(req({ "content-type": "application/json; charset=utf-8", host: "127.0.0.1:3100", "sec-fetch-site": "none" }), "rid", { stateChanging: true })).toBeNull();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""])(
    "415 unsupported_media_type for content-type %j (a simple request that skips the CORS preflight)",
    async (ct) => {
      const r = guardApiRequest(req({ ...(ct ? { "content-type": ct } : {}), host: "127.0.0.1:3100" }), "rid", { stateChanging: true });
      expect(status(r)).toBe(415);
      expect(await code(r)).toBe("unsupported_media_type");
    },
  );

  it.each([
    ["cross-site Origin", { origin: "https://evil.example.com" }],
    ["opaque Origin", { origin: "null" }],
    ["same-site other port Origin", { origin: "http://127.0.0.1:3000" }],
    ["Sec-Fetch-Site cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site same-site", { "sec-fetch-site": "same-site" }],
  ])("403 forbidden_origin for %s", async (_label, extra) => {
    const r = guardApiRequest(req({ ...json, host: "127.0.0.1:3100", ...extra }), "rid", { stateChanging: true });
    expect(status(r)).toBe(403);
    expect(await code(r)).toBe("forbidden_origin");
  });
});

describe("guardApiRequest: Host allow-list on every /api route (DNS rebinding)", () => {
  it.each(["evil.example.com:3100", "127.0.0.1.nip.io:3100", "192.168.1.5:3100", "[::2]:3100"])("403 forbidden_origin for Host %s", async (host) => {
    for (const stateChanging of [false, true]) {
      const r = guardApiRequest(req({ ...json, host }, stateChanging ? "POST" : "GET"), "rid", { stateChanging });
      expect(status(r)).toBe(403);
      expect(await code(r)).toBe("forbidden_origin");
    }
  });

  it("GET from a loopback Host passes regardless of Origin (reads are protected by CORS)", () => {
    expect(guardApiRequest(req({ host: "127.0.0.1:3100" }, "GET"), "rid", { stateChanging: false })).toBeNull();
    expect(guardApiRequest(req({ host: "localhost:3100", origin: "https://evil.example.com" }, "GET"), "rid", { stateChanging: false })).toBeNull();
  });

  it("falls back to the request URL host when there is no Host header", () => {
    expect(guardApiRequest(new Request("http://127.0.0.1/api/runs"), "rid", { stateChanging: false })).toBeNull();
    expect(status(guardApiRequest(new Request("http://evil.example.com/api/runs"), "rid", { stateChanging: false }))).toBe(403);
  });
});
