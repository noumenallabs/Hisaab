import { describe, it, expect } from "vitest"
import { generateTripShareText } from "@/features/balances/shareSummary"

describe("generateTripShareText", () => {
  it("formats a clean settlement summary with transfers and trip stats", () => {
    const text = generateTripShareText({
      tripName: "Goa Weekend 2026",
      currency: "INR",
      totalMinor: 4850000, // ₹48,500
      expenseCount: 18,
      transfers: [
        { fromName: "Rahul", toName: "Viru", amountMinor: 345000 },
        { fromName: "Akhil", toName: "Viru", amountMinor: 120000 },
      ],
      tripUrl: "https://hissaab.app/trips/goa-2026/balances",
    })

    expect(text).toContain("Goa Weekend 2026")
    expect(text).toContain("Total Spent: ₹48,500.00 (18 expenses)")
    expect(text).toContain("👉 *Rahul* pays *Viru*: ₹3,450.00")
    expect(text).toContain("👉 *Akhil* pays *Viru*: ₹1,200.00")
    expect(text).toContain("https://hissaab.app/trips/goa-2026/balances")
  })

  it("handles all-settled state cleanly", () => {
    const text = generateTripShareText({
      tripName: "Tokyo 2026",
      currency: "JPY",
      totalMinor: 150000, // ¥150,000
      expenseCount: 12,
      transfers: [],
      tripUrl: "https://hissaab.app/trips/tokyo/balances",
    })

    expect(text).toContain("Tokyo 2026")
    expect(text).toContain("🎉 All balances are settled up!")
  })
})
