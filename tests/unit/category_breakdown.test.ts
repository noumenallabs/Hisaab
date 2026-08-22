import { describe, it, expect } from "vitest"
import {
  computeCategoryBreakdown,
  computeGroupCategorySummary,
  computePairwiseLedger,
} from "@/features/balances/categoryMath"

describe("computeCategoryBreakdown", () => {
  const sampleExpenses = [
    {
      id: "exp-1",
      category: "accommodation",
      amount_minor: 1200000, // ₹12,000
      expense_payers: [{ user_id: "user-alex", amount_paid_minor: 1200000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 600000 },
        { user_id: "user-sam", amount_owed_minor: 600000 },
      ],
    },
    {
      id: "exp-2",
      category: "transport",
      amount_minor: 300000, // ₹3,000
      expense_payers: [{ user_id: "user-sam", amount_paid_minor: 300000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 150000 },
        { user_id: "user-sam", amount_owed_minor: 150000 },
      ],
    },
    {
      id: "exp-3",
      category: "food",
      amount_minor: 400000, // ₹4,000
      expense_payers: [{ user_id: "user-sam", amount_paid_minor: 400000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 200000 },
        { user_id: "user-sam", amount_owed_minor: 200000 },
      ],
    },
    {
      id: "exp-4-deleted",
      category: "food",
      amount_minor: 500000,
      deleted_at: "2026-08-20T10:00:00Z",
      expense_payers: [{ user_id: "user-alex", amount_paid_minor: 500000 }],
      expense_splits: [{ user_id: "user-sam", amount_owed_minor: 500000 }],
    },
  ]

  it("calculates exact category Paid, Share, and Net for a specific member", () => {
    const alexBreakdown = computeCategoryBreakdown(sampleExpenses, "user-alex")
    
    // Accommodation: Paid ₹12,000, Share ₹6,000 -> Net +₹6,000
    const stay = alexBreakdown.find((c) => c.category === "accommodation")!
    expect(stay).toBeDefined()
    expect(stay.paidMinor).toBe(1200000)
    expect(stay.shareMinor).toBe(600000)
    expect(stay.netMinor).toBe(600000)

    // Transport: Paid ₹0, Share ₹1,500 -> Net -₹1,500
    const transport = alexBreakdown.find((c) => c.category === "transport")!
    expect(transport).toBeDefined()
    expect(transport.paidMinor).toBe(0)
    expect(transport.shareMinor).toBe(150000)
    expect(transport.netMinor).toBe(-150000)

    // Food: Paid ₹0, Share ₹2,000 -> Net -₹2,000
    const food = alexBreakdown.find((c) => c.category === "food")!
    expect(food).toBeDefined()
    expect(food.paidMinor).toBe(0)
    expect(food.shareMinor).toBe(200000)
    expect(food.netMinor).toBe(-200000)

    // Conservation check: Sum of category nets for Alex (+6000 - 1500 - 2000 = +2500)
    const totalNet = alexBreakdown.reduce((sum, c) => sum + c.netMinor, 0)
    expect(totalNet).toBe(250000) // ₹2,500 net credit
  })

  it("ignores soft-deleted expenses in category calculations", () => {
    const alexBreakdown = computeCategoryBreakdown(sampleExpenses, "user-alex")
    const food = alexBreakdown.find((c) => c.category === "food")!
    // If exp-4-deleted was included, Alex's food paidMinor would be 500000
    expect(food.paidMinor).toBe(0)
  })

  it("computes group category summary with total spend and percentage shares", () => {
    const groupSummary = computeGroupCategorySummary(sampleExpenses)
    
    // Total spend = 12000 + 3000 + 4000 = ₹19,000 (1,900,000 minor)
    expect(groupSummary.totalTripMinor).toBe(1900000)
    
    const stay = groupSummary.categories.find((c) => c.category === "accommodation")!
    expect(stay.totalMinor).toBe(1200000)
    expect(stay.percentage).toBeCloseTo((1200000 / 1900000) * 100, 1)

    const transport = groupSummary.categories.find((c) => c.category === "transport")!
    expect(transport.totalMinor).toBe(300000)

    const food = groupSummary.categories.find((c) => c.category === "food")!
    expect(food.totalMinor).toBe(400000)
  })
})

describe("computePairwiseLedger", () => {
  const sampleExpenses = [
    {
      id: "exp-1",
      description: "Hotel Grand",
      category: "accommodation",
      amount_minor: 1200000,
      expense_payers: [{ user_id: "user-alex", amount_paid_minor: 1200000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 600000 },
        { user_id: "user-sam", amount_owed_minor: 600000 },
      ],
    },
    {
      id: "exp-2",
      description: "Airport Taxi",
      category: "transport",
      amount_minor: 300000,
      expense_payers: [{ user_id: "user-sam", amount_paid_minor: 300000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 150000 },
        { user_id: "user-sam", amount_owed_minor: 150000 },
      ],
    },
  ]

  it("extracts pairwise shared expenses between two travelers", () => {
    const ledger = computePairwiseLedger(sampleExpenses, "user-alex", "user-sam")
    expect(ledger.items.length).toBe(2)
    
    // In Hotel Grand: Alex paid 12000, Sam owed 6000 (Alex is owed +6000 by Sam)
    const hotel = ledger.items.find((x) => x.description === "Hotel Grand")!
    expect(hotel.amountOwedByBToA).toBe(600000)

    // In Airport Taxi: Sam paid 3000, Alex owed 1500 (Alex owes Sam 1500, or net +6000 - 1500 = +4500)
    const taxi = ledger.items.find((x) => x.description === "Airport Taxi")!
    expect(taxi.amountOwedByAToB).toBe(150000)

    expect(ledger.netPairwiseMinor).toBe(450000) // Sam owes Alex ₹4,500 directly
  })
})
