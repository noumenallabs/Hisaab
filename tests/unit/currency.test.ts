import { describe, it, expect } from "vitest"
import { decimalsFor, parseCurrencyInput, formatMinor, toMinor, fromMinor } from "@/lib/currency"

describe("currency", () => {
  it("decimalsFor JPY 0 others 2", () => {
    expect(decimalsFor("JPY")).toBe(0)
    expect(decimalsFor("jpy")).toBe(0)
    expect(decimalsFor("INR")).toBe(2)
    expect(decimalsFor("USD")).toBe(2)
    expect(decimalsFor("AED")).toBe(2)
    expect(decimalsFor("UNKNOWN")).toBe(2)
  })
  it("parseCurrencyInput major to minor", () => {
    expect(parseCurrencyInput("10.00", "INR")).toBe(1000)
    expect(parseCurrencyInput("10", "JPY")).toBe(10)
    expect(parseCurrencyInput("10.5", "JPY")).toBeNull() // JPY 0 decimals rejects fraction
    expect(parseCurrencyInput("1,250.50", "INR")).toBe(125050)
  })
  it("formatMinor major display", () => {
    // 1000 minor INR = 10.00 major
    const s = formatMinor(1000, "INR", "en-IN")
    expect(s).toMatch(/10\.00/)
    expect(s).toMatch(/₹|INR/)
    const jpy = formatMinor(1000, "JPY", "en-JP")
    expect(jpy).toMatch(/1,000/)
    expect(jpy).not.toMatch(/1,000\.00/)
  })
  it("toMinor/fromMinor round-trip", () => {
    expect(toMinor(10.005, 2)).toBe(1001)
    expect(fromMinor(1001, 2)).toBeCloseTo(10.01)
  })
})
