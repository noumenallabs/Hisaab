import { describe, it, expect } from "vitest"
import { toMinor, fromMinor, parseCurrencyInput, allocateEqual, allocatePercent, allocateShares, allocateExact } from "@/features/expenses/money"

describe("money extended - decimals", () => {
  it("handles 0 decimals edge", () => { expect(toMinor(0,0)).toBe(0); expect(toMinor(0.4,0)).toBe(0); expect(toMinor(0.6,0)).toBe(1) })
  it("handles large amounts", () => { expect(toMinor(99999.99,2)).toBe(9999999); expect(fromMinor(9999999,2)).toBe(99999.99) })
  it("parseCurrencyInput handles leading zeros", () => { expect(parseCurrencyInput("00012.30",2)).toBe(1230) })
  it("parseCurrencyInput handles + sign rejected", () => { expect(parseCurrencyInput("+12.34",2)).toBeNull() })
  it("parseCurrencyInput handles only dot", () => { expect(parseCurrencyInput(".",2)).toBeNull() })
  it("parseCurrencyInput handles .5", () => { expect(parseCurrencyInput(".5",2)).toBe(50) })
  it("parseCurrencyInput trims spaces", () => { expect(parseCurrencyInput("  12.34  ",2)).toBe(1234) })
})

describe("allocateEqual exhaustive", () => {
  for (let total of [1,2,3,7,100,1000, 9999]) {
    for (let count of [1,2,3,5,7]) {
      it(`total ${total} count ${count} sums correctly`, () => {
        const r = allocateEqual(total, count)
        expect(r.length).toBe(count)
        expect(r.reduce((a,b)=>a+b,0)).toBe(total)
        // remainder goes to first indices
        for (let i=1;i<r.length;i++) expect(r[i-1]-r[i]).toBeLessThanOrEqual(1)
      })
    }
  }
})

describe("allocatePercent exhaustive", () => {
  it("splits 100.00 exactly", () => { expect(allocatePercent(10000, [25,25,25,25])!.reduce((a,b)=>a+b,0)).toBe(10000) })
  it("rejects 99.99", () => { expect(allocatePercent(10000, [33.33,33.33,33.33])).toBeNull() })
  it("rejects negative percents even if sum is 100", () => { expect(allocatePercent(10000, [-10, 110])).toBeNull() })
  it("handles 0 percent for some", () => {
    const r = allocatePercent(1000, [0,100,0])
    expect(r).not.toBeNull()
    expect(r![1]).toBe(1000)
  })
})

describe("allocateShares exhaustive", () => {
  it("all equal shares", () => { const r=allocateShares(1200,[1,1,1]); expect(r).toEqual([400,400,400]) })
  it("single large share dominates", () => {
    const r=allocateShares(1000,[1,100])
    expect(r![0]).toBeLessThan(r![1])
    expect(r!.reduce((a,b)=>a+b,0)).toBe(1000)
  })
  it("negative shares rejected even if sum > 0", () => {
    expect(allocateShares(1000, [-1, 1])).toBeNull()
    expect(allocateShares(1000, [-1, 2])).toBeNull()
  })
})

describe("allocateExact exhaustive", () => {
  it("order preserved", () => { expect(allocateExact(600,[100,200,300])).toEqual([100,200,300]) })
  it("zero amount handled", () => { expect(allocateExact(0,[0,0])).toEqual([0,0]) })
})
