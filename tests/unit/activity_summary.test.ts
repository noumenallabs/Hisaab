import { describe, it, expect } from "vitest"
import { formatActivitySummary } from "@/features/activity/activitySummary"

describe("formatActivitySummary", () => {
  const memberMap = new Map([
    ["user-viru", "viruhemanth"],
    ["user-akhil", "qa.akhil"],
    ["user-meghana", "qa.meghana"],
  ])

  it("credits the actual payer when recorded by someone else", () => {
    const auditLog = {
      action: "create",
      entity_type: "expense",
      actor_user_id: "user-viru",
      entity_id: "exp-1",
      new_values: {
        description: "Dinner at Beachside",
        amount_minor: 120000,
        currency: "INR",
      },
    }

    const expensesMap = new Map([
      [
        "exp-1",
        {
          id: "exp-1",
          description: "Dinner at Beachside",
          amount_minor: 120000,
          currency: "INR",
          expense_payers: [{ user_id: "user-akhil", amount_paid_minor: 120000 }],
        },
      ],
    ])

    const summary = formatActivitySummary(auditLog, "viruhemanth", memberMap, expensesMap, "INR")
    expect(summary).toBe('qa.akhil paid ₹1,200.00 for "Dinner at Beachside" (recorded by viruhemanth)')
  })

  it("phrases cleanly when actor is also the payer", () => {
    const auditLog = {
      action: "create",
      entity_type: "expense",
      actor_user_id: "user-viru",
      entity_id: "exp-2",
      new_values: {
        description: "Fuel",
        amount_minor: 50000,
        currency: "INR",
      },
    }

    const expensesMap = new Map([
      [
        "exp-2",
        {
          id: "exp-2",
          description: "Fuel",
          amount_minor: 50000,
          currency: "INR",
          expense_payers: [{ user_id: "user-viru", amount_paid_minor: 50000 }],
        },
      ],
    ])

    const summary = formatActivitySummary(auditLog, "viruhemanth", memberMap, expensesMap, "INR")
    expect(summary).toBe('viruhemanth paid ₹500.00 for "Fuel"')
  })

  it("handles multi-payer split expenses", () => {
    const auditLog = {
      action: "create",
      entity_type: "expense",
      actor_user_id: "user-viru",
      entity_id: "exp-3",
      new_values: {
        description: "Villa Booking",
        amount_minor: 1000000,
        currency: "INR",
      },
    }

    const expensesMap = new Map([
      [
        "exp-3",
        {
          id: "exp-3",
          description: "Villa Booking",
          amount_minor: 1000000,
          currency: "INR",
          expense_payers: [
            { user_id: "user-akhil", amount_paid_minor: 500000 },
            { user_id: "user-meghana", amount_paid_minor: 500000 },
          ],
        },
      ],
    ])

    const summary = formatActivitySummary(auditLog, "viruhemanth", memberMap, expensesMap, "INR")
    expect(summary).toBe('viruhemanth recorded "Villa Booking" (₹10,000.00 split paid by qa.akhil, qa.meghana)')
  })
})
