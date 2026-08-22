import { describe, it, expect } from "vitest"
import { prepareSummaryCardData, type SummaryCardOptions } from "@/features/balances/generateSummaryCanvas"

describe("prepareSummaryCardData", () => {
  const sampleOpts: SummaryCardOptions = {
    tripName: "Manali Roadtrip",
    currency: "INR",
    totalMinor: 4500000, // ₹45,000
    expenseCount: 18,
    memberCount: 5,
    transfers: [
      { fromName: "Rahul", toName: "Viru", amountMinor: 450000 },
      { fromName: "Akhil", toName: "Viru", amountMinor: 320000 },
    ],
    categories: [
      { label: "Stay & Lodging", emoji: "🏨", totalMinor: 2500000, percentage: 55.6 },
      { label: "Food & Dining", emoji: "🍕", totalMinor: 1500000, percentage: 33.3 },
      { label: "Transport & Fuel", emoji: "🚕", totalMinor: 500000, percentage: 11.1 },
    ],
  }

  it("formats title, formatted metrics, and category summaries", () => {
    const data = prepareSummaryCardData(sampleOpts)

    expect(data.tripTitle).toBe("Manali Roadtrip")
    expect(data.formattedTotal).toContain("45,000")
    expect(data.expenseCountLabel).toBe("18 transactions")
    expect(data.memberCountLabel).toBe("5 travelers")
    expect(data.transfers.length).toBe(2)
    expect(data.categories.length).toBe(3)
  })

  it("handles trips with zero transfers as settled", () => {
    const settledOpts: SummaryCardOptions = {
      ...sampleOpts,
      transfers: [],
    }
    const data = prepareSummaryCardData(settledOpts)
    expect(data.isSettled).toBe(true)
    expect(data.transfers.length).toBe(0)
  })
})
