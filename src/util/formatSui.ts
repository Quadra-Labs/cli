// formatSui.ts — human-readable formatting for on-chain amounts. SUI is denominated in MIST
// (9 decimals); QUADRA is denominated in base units (6 decimals, 1 QUADRA = 1_000_000 base
// units). All inputs are base-unit integers carried as bigint/number/string.

const SUI_DECIMALS = 9n;
const QUADRA_DECIMALS = 6n;

function toBig(value: bigint | number | string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.round(value));
  return BigInt(value);
}

// Render a base-unit integer as a fixed-decimal string, trimming trailing zeros but
// keeping at least one fractional digit (so "1.0" reads as a token amount, not a count).
function format(baseUnits: bigint, decimals: bigint): string {
  const negative = baseUnits < 0n;
  const abs = negative ? -baseUnits : baseUnits;
  const divisor = 10n ** decimals;
  const whole = abs / divisor;
  const frac = abs % divisor;
  let fracStr = frac.toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  if (fracStr.length === 0) fracStr = "0";
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

/** Format MIST as a SUI amount string (no unit suffix). */
export function formatSui(mist: bigint | number | string): string {
  return format(toBig(mist), SUI_DECIMALS);
}

/** Format QUADRA base units as a QUADRA amount string (no unit suffix). */
export function formatQuadra(baseUnits: bigint | number | string): string {
  return format(toBig(baseUnits), QUADRA_DECIMALS);
}

/** Shorten a 0x address for compact display, e.g. 0x1234…cdef. */
export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
