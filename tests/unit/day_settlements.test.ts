import { describe, it, expect } from "vitest"
import { computeDayDebts, computeDayTimeline, computeMemberDayBreakdown } from "@/features/balances/dayMath"

describe("dayMath", () => {
  const sampleExpenses = [
    {
      id: "exp-1",
      description: "Day 1 Breakfast",
      expense_date: "2026-08-20",
      amount_minor: 3000,
      expense_payers: [{ user_id: "user-a", amount_paid_minor: 3000 }],
      expense_splits: [
        { user_id: "user-a", amount_owed_minor: 1000 },
        { user_id: "user-b", amount_owed_minor: 1000 },
        { user_id: "user-c", amount_owed_minor: 1000 },
      ],
    },
    {
      id: "exp-2",
      description: "Day 1 Cab",
      expense_date: "2026-08-20",
      amount_minor: 1500,
      expense_payers: [{ user_id: "user-b", amount_paid_minor: 1500 }],
      expense_splits: [
        { user_id: "user-a", amount_owed_minor: 500 },
        { user_id: "user-b", amount_owed_minor: 500 },
        { user_id: "user-c", amount_owed_minor: 500 },
      ],
    },
    {
      id: "exp-3",
      description: "Day 2 Scuba Diving",
      expense_date: "2026-08-21",
      amount_minor: 6000,
      expense_payers: [{ user_id: "user-c", amount_paid_minor: 6000 }],
      expense_splits: [
        { user_id: "user-a", amount_owed_minor: 2000 },
        { user_id: "user-b", amount_owed_minor: 2000 },
        { user_id: "user-c", amount_owed_minor: 2000 },
      ],
    },
    {
      id: "exp-4",
      description: "Soft deleted expense",
      expense_date: "2026-08-20",
      amount_minor: 9999,
      deleted_at: "2026-08-20T12:00:00Z",
      expense_payers: [{ user_id: "user-a", amount_paid_minor: 9999 }],
      expense_splits: [{ user_id: "user-b", amount_owed_minor: 9999 }],
    },
  ]

  describe("computeDayDebts", () => {
    it("calculates isolated zero-sum debts for a specific day (2026-08-20)", () => {
      const res = computeDayDebts(sampleExpenses, "2026-08-20")
      // Day 1:
      // user-a paid 3000, owed 1500 -> net = +1500
      // user-b paid 1500, owed 1500 -> net = 0
      // user-c paid 0, owed 1500 -> net = -1500
      expect(res.net["user-a"]).toBe(1500)
      expect(res.net["user-b"]).toBe(0)
      expect(res.net["user-c"]).toBe(-1500)

      // Minimal transfer: user-c pays user-a 1500
      expect(res.transfers).toHaveLength(1)
      expect(res.transfers[0]).toEqual({
        fromId: "user-c",
        toId: "user-a",
        amount: 1500,
      })
    })

    it("calculates isolated zero-sum debts for Day 2 (2026-08-21)", () => {
      const res = computeDayDebts(sampleExpenses, "2026-08-21")
      // Day 2:
      // user-c paid 6000, owed 2000 -> net = +4000
      // user-a paid 0, owed 2000 -> net = -2000
      // user-b paid 0, owed 2000 -> net = -2000
      expect(res.net["user-c"]).toBe(4000)
      expect(res.net["user-a"]).toBe(-2000)
      expect(res.net["user-b"]).toBe(-2000)

      expect(res.transfers).toHaveLength(2)
      const totalTransfers = res.transfers.reduce((s, t) => s + t.amount, 0)
      expect(totalTransfers).toBe(4000)
    })

    it("returns all active combined debts when date is 'all'", () => {
      const res = computeDayDebts(sampleExpenses, "all")
      // Total net:
      // user-a: 1500 - 2000 = -500
      // user-b: 0 - 2000 = -2000
      // user-c: -1500 + 4000 = +2500
      expect(res.net["user-a"]).toBe(-500)
      expect(res.net["user-b"]).toBe(-2000)
      expect(res.net["user-c"]).toBe(2500)
    })
  })

  describe("computeDayTimeline", () => {
    it("generates chronological timeline with day numbering and stats", () => {
      const timeline = computeDayTimeline(sampleExpenses, "2026-08-20")
      expect(timeline).toHaveLength(2)

      expect(timeline[0].date).toBe("2026-08-20")
      expect(timeline[0].dayNumber).toBe(1)
      expect(timeline[0].totalMinor).toBe(4500)
      expect(timeline[0].expenseCount).toBe(2)
      expect(timeline[0].transfers).toHaveLength(1)

      expect(timeline[1].date).toBe("2026-08-21")
      expect(timeline[1].dayNumber).toBe(2)
      expect(timeline[1].totalMinor).toBe(6000)
      expect(timeline[1].expenseCount).toBe(1)
    })
  })

  describe("computeMemberDayBreakdown", () => {
    it("computes per-day spending and owed amounts for a specific user", () => {
      const breakdown = computeMemberDayBreakdown(sampleExpenses, "user-a")
      expect(breakdown).toHaveLength(2)

      // Day 1: user-a paid 3000, owed 1500, net = +1500
      expect(breakdown[0].date).toBe("2026-08-20")
      expect(breakdown[0].paidMinor).toBe(3000)
      expect(breakdown[0].owedMinor).toBe(1500)
      expect(breakdown[0].netMinor).toBe(1500)

      // Day 2: user-a paid 0, owed 2000, net = -2000
      expect(breakdown[1].date).toBe("2026-08-21")
      expect(breakdown[1].paidMinor).toBe(0)
      expect(breakdown[1].owedMinor).toBe(2000)
      expect(breakdown[1].netMinor).toBe(-2000)
    })
  })
})
