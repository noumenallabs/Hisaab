import { describe, it, expect } from "vitest"
import { computeCategoryDebts } from "@/features/balances/categoryMath"

describe("computeCategoryDebts", () => {
  const sampleExpenses = [
    {
      id: "exp-hotel",
      category: "accommodation",
      amount_minor: 1200000, // ₹12,000
      expense_payers: [{ user_id: "user-alex", amount_paid_minor: 1200000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 400000 },
        { user_id: "user-sam", amount_owed_minor: 400000 },
        { user_id: "user-rahul", amount_owed_minor: 400000 },
      ],
    },
    {
      id: "exp-food",
      category: "food",
      amount_minor: 300000, // ₹3,000
      expense_payers: [{ user_id: "user-sam", amount_paid_minor: 300000 }],
      expense_splits: [
        { user_id: "user-alex", amount_owed_minor: 100000 },
        { user_id: "user-sam", amount_owed_minor: 100000 },
        { user_id: "user-rahul", amount_owed_minor: 100000 },
      ],
    },
  ]

  it("calculates isolated category settlements for accommodation", () => {
    const staySettlements = computeCategoryDebts(sampleExpenses, "accommodation")

    // Net for stay:
    // Alex: +₹8,000 (paid 12,000, share 4,000)
    // Sam: -₹4,000 (paid 0, share 4,000)
    // Rahul: -₹4,000 (paid 0, share 4,000)
    expect(staySettlements.net["user-alex"]).toBe(800000)
    expect(staySettlements.net["user-sam"]).toBe(-400000)
    expect(staySettlements.net["user-rahul"]).toBe(-400000)

    // Transfers: Sam pays Alex ₹4,000; Rahul pays Alex ₹4,000
    expect(staySettlements.transfers.length).toBe(2)
    const samTransfer = staySettlements.transfers.find((t) => t.fromId === "user-sam")!
    expect(samTransfer.toId).toBe("user-alex")
    expect(samTransfer.amount).toBe(400000)

    const rahulTransfer = staySettlements.transfers.find((t) => t.fromId === "user-rahul")!
    expect(rahulTransfer.toId).toBe("user-alex")
    expect(rahulTransfer.amount).toBe(400000)
  })

  it("calculates isolated category settlements for food", () => {
    const foodSettlements = computeCategoryDebts(sampleExpenses, "food")

    // Net for food:
    // Sam: +₹2,000 (paid 3,000, share 1,000)
    // Alex: -₹1,000 (paid 0, share 1,000)
    // Rahul: -₹1,000 (paid 0, share 1,000)
    expect(foodSettlements.net["user-sam"]).toBe(200000)
    expect(foodSettlements.net["user-alex"]).toBe(-100000)
    expect(foodSettlements.net["user-rahul"]).toBe(-100000)

    expect(foodSettlements.transfers.length).toBe(2)
    const alexTransfer = foodSettlements.transfers.find((t) => t.fromId === "user-alex")!
    expect(alexTransfer.toId).toBe("user-sam")
    expect(alexTransfer.amount).toBe(100000)
  })

  it("returns global combined settlements when category is 'all'", () => {
    const allSettlements = computeCategoryDebts(sampleExpenses, "all")

    // Overall Net:
    // Alex: +8,000 (stay) - 1,000 (food) = +7,000
    // Sam: -4,000 (stay) + 2,000 (food) = -2,000
    // Rahul: -4,000 (stay) - 1,000 (food) = -5,000
    expect(allSettlements.net["user-alex"]).toBe(700000)
    expect(allSettlements.net["user-sam"]).toBe(-200000)
    expect(allSettlements.net["user-rahul"]).toBe(-500000)

    // Simplified transfers: Sam pays Alex ₹2,000; Rahul pays Alex ₹5,000
    expect(allSettlements.transfers.length).toBe(2)
    const samTransfer = allSettlements.transfers.find((t) => t.fromId === "user-sam")!
    expect(samTransfer.toId).toBe("user-alex")
    expect(samTransfer.amount).toBe(200000)
  })
})
