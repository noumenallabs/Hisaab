import { describe, it, expect } from "vitest"
import { simplifyDebts } from "@/features/balances/balanceMath"
import {
  computeDayTimeline,
  computeDayDebts,
  computeMemberDayBreakdown,
} from "@/features/balances/dayMath"
import {
  computeCategoryBreakdown,
  computeGroupCategorySummary,
  computePairwiseLedger,
} from "@/features/balances/categoryMath"
import {
  formatMinor,
  parseCurrencyInput,
  fromMinor,
  toMinor,
  decimalsFor,
} from "@/lib/currency"

describe("Dashboard Mathematical Derivations & Edge Case Stress Testing", () => {
  describe("simplifyDebts Adversarial Harness", () => {
    it("collapses circular debts across 50 users into 0 transfers", () => {
      // Circular debt: user0 -> user1 -> user2 ... -> user49 -> user0
      // Net balance for everyone is 0
      const net: Record<string, number> = {}
      for (let i = 0; i < 50; i++) {
        net[`user_${i}`] = 0
      }
      const transfers = simplifyDebts(net)
      expect(transfers).toEqual([])
    })

    it("handles 100 debtors and 1 single creditor with exact conservation", () => {
      const net: Record<string, number> = {}
      let totalDebt = 0
      for (let i = 1; i <= 100; i++) {
        const debt = i * 100 // $1, $2, ... $100
        net[`debtor_${i}`] = -debt
        totalDebt += debt
      }
      net["creditor_0"] = totalDebt

      const transfers = simplifyDebts(net)
      expect(transfers.length).toBe(100)
      const sumTransferred = transfers.reduce((s, t) => s + t.amount, 0)
      expect(sumTransferred).toBe(totalDebt)
      for (const t of transfers) {
        expect(t.toId).toBe("creditor_0")
      }
    })

    it("handles unbalanced net balances (conservation sum != 0) without infinite loops", () => {
      // Degraded input where database had rounding or dropped records
      const net: Record<string, number> = {
        user_a: 500, // creditor has 500
        user_b: -300, // debtor owes 300 (200 unaccounted)
      }
      const transfers = simplifyDebts(net)
      expect(transfers).toEqual([
        { fromId: "user_b", toId: "user_a", amount: 300 },
      ])
    })

    it("handles huge integer amounts up to Number.MAX_SAFE_INTEGER", () => {
      const hugeAmount = 9000000000000000 // 90 trillion
      const net = {
        alice: hugeAmount,
        bob: -hugeAmount,
      }
      const transfers = simplifyDebts(net)
      expect(transfers).toEqual([
        { fromId: "bob", toId: "alice", amount: hugeAmount },
      ])
    })
  })

  describe("computeDayTimeline & Extreme Dates Stress", () => {
    it("handles dates spanning leap years, multi-year gaps, and same-day clusters", () => {
      const expenses = [
        { id: "e1", expense_date: "2024-02-28", amount_minor: 1000 },
        { id: "e2", expense_date: "2024-02-29", amount_minor: 2000 }, // Leap day
        { id: "e3", expense_date: "2024-03-01", amount_minor: 3000 },
        { id: "e4", expense_date: "2028-02-29", amount_minor: 4000 }, // 4 years later
      ]
      const timeline = computeDayTimeline(expenses, "2024-02-28")

      expect(timeline.length).toBe(4)
      expect(timeline[0].dayNumber).toBe(1)
      expect(timeline[1].dayNumber).toBe(2)
      expect(timeline[2].dayNumber).toBe(3)
      // 2028-02-29 is 1462 days after 2024-02-28 -> dayNumber = 1463
      expect(timeline[3].dayNumber).toBe(1463)
    })

    it("handles expenses with ISO timestamps with timezones or missing date fields", () => {
      const expenses = [
        {
          id: "e1",
          created_at: "2026-08-20T14:30:00.000Z",
          amount_minor: 1500,
        },
        { id: "e2", date: "2026-08-21", amount_minor: 2500 },
        { id: "e3", amount_minor: 500 }, // No date field at all
      ]
      const timeline = computeDayTimeline(expenses)
      expect(timeline.length).toBeGreaterThanOrEqual(2)
      for (const item of timeline) {
        expect(Number.isFinite(item.totalMinor)).toBe(true)
        expect(item.totalMinor).toBeGreaterThan(0)
      }
    })

    it("returns empty timeline for empty expenses array or only deleted expenses", () => {
      const timelineEmpty = computeDayTimeline([])
      expect(timelineEmpty).toEqual([])

      const timelineDeleted = computeDayTimeline([
        { id: "d1", deleted: true, amount_minor: 5000 },
        { id: "d2", deleted_at: "2026-08-20", amount_minor: 3000 },
      ])
      expect(timelineDeleted).toEqual([])
    })
  })

  describe("computeCategoryBreakdown & computeGroupCategorySummary", () => {
    it("computes exact category percentages and handles 0 total without NaN", () => {
      const emptySummary = computeGroupCategorySummary([])
      expect(emptySummary.totalTripMinor).toBe(0)
      for (const cat of emptySummary.categories) {
        expect(cat.totalMinor).toBe(0)
        expect(cat.percentage).toBe(0)
        expect(Number.isNaN(cat.percentage)).toBe(false)
      }
    })

    it("correctly buckets unrecognized categories under 'other'", () => {
      const expenses = [
        { id: "e1", category: "crypto", amount_minor: 5000 },
        { id: "e2", category: "yacht", amount_minor: 15000 },
      ]
      const summary = computeGroupCategorySummary(expenses)
      const otherCat = summary.categories.find((c) => c.category === "other")
      expect(otherCat).toBeDefined()
      expect(otherCat!.totalMinor).toBe(20000)
      expect(otherCat!.percentage).toBe(100)
    })

    it("accurately computes pairwise ledger across multi-payer multi-split expenses", () => {
      const expenses = [
        {
          id: "e1",
          description: "Shared Villa",
          amount_minor: 10000,
          category: "accommodation",
          expense_payers: [
            { user_id: "alice", amount_paid_minor: 6000 },
            { user_id: "bob", amount_paid_minor: 4000 },
          ],
          expense_splits: [
            { user_id: "alice", amount_owed_minor: 5000 },
            { user_id: "bob", amount_owed_minor: 5000 },
          ],
        },
      ]
      const ledger = computePairwiseLedger(expenses, "alice", "bob")
      // Alice paid 6000 of 10000 (60%). Bob owes 5000 total. Alice funded 60% of Bob's 5000 = 3000.
      // Bob paid 4000 of 10000 (40%). Alice owes 5000 total. Bob funded 40% of Alice's 5000 = 2000.
      // Net: Alice funded 3000 for Bob, Bob funded 2000 for Alice -> Bob owes Alice 1000.
      expect(ledger.totalPaidByAForB).toBe(3000)
      expect(ledger.totalPaidByBForA).toBe(2000)
      expect(ledger.netPairwiseMinor).toBe(1000)
    })
  })

  describe("Currency Formatting & Conversion Utilities", () => {
    it("handles 0 decimals (JPY), 2 decimals (INR, USD, EUR), and unknown currencies", () => {
      expect(decimalsFor("JPY")).toBe(0)
      expect(decimalsFor("INR")).toBe(2)
      expect(decimalsFor("USD")).toBe(2)
      expect(decimalsFor("UNKNOWN")).toBe(2)

      expect(formatMinor(1000, "JPY")).toBe("¥1,000")
      expect(formatMinor(1000, "USD")).toBe("$10.00")
      expect(formatMinor(0, "USD")).toBe("$0.00")
      expect(formatMinor(-1000, "USD")).toBe("-$10.00")
      expect(formatMinor(NaN, "USD")).toBe("$0.00")
      expect(formatMinor(Infinity, "USD")).toBe("$0.00")
    })

    it("parses currency inputs robustly", () => {
      expect(parseCurrencyInput("100.50", "USD")).toBe(10050)
      expect(parseCurrencyInput("100", "JPY")).toBe(100)
      expect(parseCurrencyInput("invalid", "USD")).toBeNull()
      expect(parseCurrencyInput("", "USD")).toBeNull()
      expect(parseCurrencyInput("100.999", "USD")).toBeNull() // Too many decimals
    })
  })
})
