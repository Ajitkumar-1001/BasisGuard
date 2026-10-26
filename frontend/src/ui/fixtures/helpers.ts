/** Deterministic 64-char lowercase hex digest stand-in (not cryptographic). */
export function hex64(seed: string): string {
  let out = "";
  for (let block = 0; block < 8; block += 1) {
    let h = 0x811c9dc5 ^ (block * 0x9e3779b1);
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}
