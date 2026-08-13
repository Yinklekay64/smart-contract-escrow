export function shortAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function shortHash(value) {
  if (!value) return "";
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

/** Normalize an ScVal-decoded number (could be number, bigint, or string). */
export function toNumber(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value);
}

/** Format an i128 token amount into a fixed-ish decimal string. */
export function formatAmount(value, decimals = 7) {
  const n = toNumber(value);
  return (n / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: decimals });
}
