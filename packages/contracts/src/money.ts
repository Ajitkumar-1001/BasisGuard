import { z } from "zod";

const USD_RE = /^\d+(\.\d{1,6})?$/;

/** Non-negative USD decimal string with at most 6 fractional digits. */
export const UsdDecimal = z.string().regex(USD_RE, "invalid USD decimal");

export function usdToMicros(value: string): bigint {
  if (!USD_RE.test(value)) throw new Error(`invalid USD decimal: "${value}"`);
  const [whole, frac = ""] = value.split(".");
  return BigInt(whole!) * 1_000_000n + BigInt(frac.padEnd(6, "0"));
}

export function microsToUsd(micros: bigint): string {
  if (micros < 0n) throw new Error("negative USD amount");
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}
