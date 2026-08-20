import { describe, it, expect } from "vitest"
import {
  toMinor, fromMinor, parseCurrencyInput, formatMinor,
  allocateEqual, allocateExact, allocatePercent, allocateShares, money
} from "@/features/expenses/money"

describe("toMinor/fromMinor", () => {
  it("zero decimals", () => { expect(toMinor(1234, 0)).toBe(1234); expect(fromMinor(1234, 0)).toBe(1234) })
  it("two decimals", () => { expect(toMinor(12.34, 2)).toBe(1234); expect(fromMinor(1234, 2)).toBe(12.34) })
  it("three decimals", () => { expect(toMinor(1.234, 3)).toBe(1234); expect(toMinor(1.2345, 3)).toBe(1235) })
  it("rounds correctly", () => { expect(toMinor(0.005, 2)).toBe(1) })
})

describe("parseCurrencyInput", () => {
  it("parses valid", () => { expect(parseCurrencyInput("12.34", 2)).toBe(1234) })
  it("rejects too many decimals", () => { expect(parseCurrencyInput("12.345", 2)).toBeNull() })
  it("handles commas", () => { expect(parseCurrencyInput("1,234.50", 2)).toBe(123450) })
  it("empty returns null", () => { expect(parseCurrencyInput("  ", 2)).toBeNull() })
  it("invalid chars null", () => { expect(parseCurrencyInput("abc", 2)).toBeNull() })
  it("three decimals valid", () => { expect(parseCurrencyInput("1.234", 3)).toBe(1234) })
  it("negative allowed", () => { expect(parseCurrencyInput("-5.00", 2)).toBe(-500) })
})

describe("formatMinor", () => {
  it("formats with currency", () => { expect(formatMinor(1234)).toContain("₹") })
})

describe("allocateEqual", () => {
  it("indivisible remainder goes one by one in order", () => {
    expect(allocateEqual(100, 3)).toEqual([34, 33, 33])
    expect(allocateEqual(10, 3)).toEqual([4, 3, 3])
    expect(allocateEqual(1000, 3)).toEqual([334, 333, 333])
  })
  it("exact division", () => { expect(allocateEqual(900, 3)).toEqual([300, 300, 300]) })
  it("sum equals total", () => {
    const a = allocateEqual(10000, 7)
    expect(a.reduce((s, v) => s + v, 0)).toBe(10000)
  })
})

describe("allocateExact", () => {
  it("valid total", () => { expect(allocateExact(1000, [400, 600])).toEqual([400, 600]) })
  it("invalid total returns null", () => { expect(allocateExact(1000, [400, 500])).toBeNull() })
})

describe("allocatePercent", () => {
  it("exactly 100", () => {
    const r = allocatePercent(10000, [50, 30, 20])
    expect(r).not.toBeNull()
    expect(r!.reduce((s, v) => s + v, 0)).toBe(10000)
  })
  it("off by 1bp returns null", () => { expect(allocatePercent(10000, [50, 30, 19.99])).toBeNull() })
  it("remainder deterministic", () => {
    const r = allocatePercent(100, [33.33, 33.33, 33.34])
    expect(r!.reduce((s, v) => s + v, 0)).toBe(100)
  })
})

describe("allocateShares", () => {
  it("zero total shares returns null", () => { expect(allocateShares(1000, [0, 0])).toBeNull() })
  it("single share gets all", () => { expect(allocateShares(1000, [0, 5])).toEqual([0, 1000]) })
  it("shares split sums to total", () => {
    const r = allocateShares(1000, [1, 2, 1])
    expect(r!.reduce((s, v) => s + v, 0)).toBe(1000)
  })
})

describe("money helper", () => {
  it("formats zero", () => { expect(money(0)).toContain("₹") })
})
