import {
  CURRENCY_DECIMALS,
  decimalsFor,
  toMinor as toMinorLib,
  fromMinor as fromMinorLib,
  parseCurrencyInput as parseCurrencyInputLib,
  formatMinor as formatMinorLib,
} from "@/lib/currency"

export const CURRENCY = "₹"

export function money(n: number): string {
  // Legacy alias — now correctly formats minor as INR major with 2 decimals
  // New code should use formatMinor(minor, currency) from @/lib/currency
  return formatMinorLib(n, "INR")
}

// Pure integer minor units helpers per spec §15 — delegate to canonical
export function toMinor(amount: number, decimals = 2): number {
  return toMinorLib(amount, decimals)
}
export function fromMinor(minor: number, decimals = 2): number {
  return fromMinorLib(minor, decimals)
}
export function parseCurrencyInput(
  input: string,
  decimals: string | number = 2
): number | null {
  // Back-compat: callers pass decimals number or currency code string
  if (typeof decimals === "string") {
    return parseCurrencyInputLib(input, decimals)
  }
  const mapped = decimals as number
  const s = input.trim().replace(/,/g, "")
  if (!s) return null
  if (!/^-?\d*(\.\d*)?$/.test(s)) return null
  const parts = s.split(".")
  if (parts[1] && parts[1].length > mapped) return null
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return toMinorLib(n, mapped)
}

export function formatMinor(minor: number, code: string = "INR"): string {
  return formatMinorLib(minor, code)
}

export { CURRENCY_DECIMALS, decimalsFor }

// Split helpers §9: remainder distribution
export type SplitMode = "equal" | "exact" | "percent" | "shares"

export function allocateEqual(totalMinor: number, count: number): number[] {
  const base = Math.floor(totalMinor / count)
  let remainder = totalMinor - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

export function allocateExact(
  totalMinor: number,
  exacts: number[],
): number[] | null {
  const sum = exacts.reduce((a, b) => a + b, 0)
  if (sum !== totalMinor) return null
  return exacts
}

export function allocatePercent(
  totalMinor: number,
  percents: number[],
): number[] | null {
  const sum = percents.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 100) > 0.001) return null
  const raw = percents.map((p) => (totalMinor * p) / 100)
  const floored = raw.map((r) => Math.floor(r))
  let remainder = totalMinor - floored.reduce((a, b) => a + b, 0)
  const fractions = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < remainder; k++)
    floored[fractions[k % fractions.length].i]++
  return floored
}

export function allocateShares(
  totalMinor: number,
  shares: number[],
): number[] | null {
  const totalShares = shares.reduce((a, b) => a + b, 0)
  if (totalShares <= 0) return null
  const raw = shares.map((s) => (totalMinor * s) / totalShares)
  const floored = raw.map((r) => Math.floor(r))
  let remainder = totalMinor - floored.reduce((a, b) => a + b, 0)
  const fractions = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < remainder; k++)
    floored[fractions[k % fractions.length].i]++
  return floored
}
