/** Canonical currency helpers — spec §3.3, §5.9, §6.1
 * Single source of truth for minor ↔ major conversion and locale-aware formatting.
 * DB truth: currency_metadata (JPY 0, INR/USD/EUR/GBP/AED/SGD 2)
 * Never ask user for minor; UI displays major only.
 */

export const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0,
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SGD: 2,
}

export function decimalsFor(code: string): number {
  const upper = code?.toUpperCase() ?? ""
  return CURRENCY_DECIMALS[upper] ?? 2
}

export function toMinor(amount: number, decimals: number): number {
  return Math.round(amount * Math.pow(10, decimals))
}

export function fromMinor(minor: number, decimals: number): number {
  return minor / Math.pow(10, decimals)
}

export function parseCurrencyInput(
  input: string,
  code: string
): number | null {
  const decimals = decimalsFor(code)
  const s = input.trim().replace(/,/g, "")
  if (!s) return null
  if (!/^-?\d*(\.\d*)?$/.test(s)) return null
  const parts = s.split(".")
  if (parts[1] && parts[1].length > decimals) return null
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return toMinor(n, decimals)
}

export function formatMinor(
  minor: number,
  code: string,
  locale?: string
): string {
  const currency = (code || "INR").toUpperCase()
  const decimals = decimalsFor(currency)
  const major = fromMinor(minor, decimals)
  try {
    return new Intl.NumberFormat(locale ?? undefined, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(major)
  } catch {
    // Fallback for unknown currency codes or Intl not supporting currency
    const sign = major < 0 ? "-" : ""
    const abs = Math.abs(major)
    return `${sign}${currency} ${abs.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`
  }
}

// Re-export legacy names for codemod safety — new code should import from @/lib/currency
export const CURRENCY = "INR" as const
