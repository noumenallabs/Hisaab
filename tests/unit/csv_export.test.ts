import { describe, it, expect } from "vitest"
import { generateExpensesCsv } from "@/features/expenses/csvExport"

describe("generateExpensesCsv", () => {
  const memberMap = new Map([
    ["user-viru", "viruhemanth"],
    ["user-akhil", "qa.akhil"],
    ["user-meghana", "qa.meghana"],
  ])

  const sampleExpenses = [
    {
      id: "exp-1",
      expense_date: "2026-08-22",
      description: "Beach Dinner",
      category: "food",
      amount_minor: 120000,
      currency: "INR",
      notes: "Seafood platter",
      receipt_path: "trips/1/receipts/rec.jpg",
      expense_payers: [{ user_id: "user-akhil", amount_paid_minor: 120000 }],
      expense_splits: [
        { user_id: "user-viru", amount_owed_minor: 40000 },
        { user_id: "user-akhil", amount_owed_minor: 40000 },
        { user_id: "user-meghana", amount_owed_minor: 40000 },
      ],
    },
    {
      id: "exp-2-deleted",
      expense_date: "2026-08-22",
      description: "Cancelled Booking",
      category: "accommodation",
      amount_minor: 500000,
      deleted_at: "2026-08-22T10:00:00Z",
      expense_payers: [{ user_id: "user-viru", amount_paid_minor: 500000 }],
      expense_splits: [{ user_id: "user-viru", amount_owed_minor: 500000 }],
    },
  ]

  it("generates a formatted CSV with headers, payer names, split participants, and currency", () => {
    const csv = generateExpensesCsv(sampleExpenses, memberMap, "INR")
    
    // Header check
    expect(csv).toContain("Date,Description,Category,Amount,Currency,Paid By,Split Between,Receipt Attached,Notes")
    
    // Content check
    expect(csv).toContain('"2026-08-22","Beach Dinner","Food","1200.00","INR","qa.akhil","viruhemanth; qa.akhil; qa.meghana","Yes","Seafood platter"')
    
    // Ignored deleted check
    expect(csv).not.toContain("Cancelled Booking")
  })
})
