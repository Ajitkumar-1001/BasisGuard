import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash, sha256Hex } from "./canonical-json";

describe("canonicalJson (documented stable serializer)", () => {
  it("sorts object keys recursively by UTF-16 code unit order, including integer-like keys", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, "10": 0, "2": 0 })).toBe(
      '{"10":0,"2":0,"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("rejects undefined as a property value, an array item, a sparse hole and at top level", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalJson({ b: [undefined, 1] })).toThrow(TypeError);
    // eslint-disable-next-line no-sparse-arrays
    expect(() => canonicalJson([, 1])).toThrow(TypeError);
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
  });

  it("rejects values JSON cannot represent faithfully, directly and nested in arrays", () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, 1n, new Date(0), new Map(), () => 1, Symbol("s")]) {
      expect(() => canonicalJson({ x: bad })).toThrow(TypeError);
      expect(() => canonicalJson([[bad]])).toThrow(TypeError);
    }
    class Thing {
      v = 1;
    }
    expect(() => canonicalJson({ x: new Thing() })).toThrow(TypeError);
  });

  it("renders -0 as 0 deterministically", () => {
    expect(canonicalJson({ z: -0 })).toBe('{"z":0}');
  });

  it("hashes equal content equally regardless of key order", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
    expect(contentHash({})).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches known vectors so serializer or hash changes cannot pass unnoticed", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(canonicalJson({ b: [true, null, "x"], a: 1 })).toBe('{"a":1,"b":[true,null,"x"]}');
    expect(contentHash({ b: [true, null, "x"], a: 1 })).toBe(
      "eca8cfb31ab74533e1eb2f4c74d2d55dfe3c79ac704787e54be8647ea7777eb1",
    );
  });
});
