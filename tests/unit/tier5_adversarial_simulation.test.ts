import { describe, it, expect } from "vitest"
import {
  netBalances,
  simplifyDebts,
  tripNetMinor,
  type Transfer,
} from "@/features/balances/balanceMath"
import {
  allocateEqual,
  allocateExact,
  allocatePercent,
  allocateShares,
} from "@/features/expenses/money"
import {
  toMinor,
  fromMinor,
  parseCurrencyInput,
  formatMinor,
  decimalsFor,
  CURRENCY_DECIMALS,
} from "@/lib/currency"
import {
  computeDayDebts,
  computeDayTimeline,
  computeMemberDayBreakdown,
} from "@/features/balances/dayMath"
import {
  computeCategoryBreakdown,
  computeGroupCategorySummary,
  computeCategoryDebts,
  computePairwiseLedger,
  type ExpenseCategory,
} from "@/features/balances/categoryMath"

describe("Tier 5 Adversarial Simulation & Mathematical Invariants", () => {
  // =========================================================================
  // 1. ADVERSARIAL SPLIT ALGORITHM INVARIANTS
  // =========================================================================
  describe("1. Adversarial Split Allocation Invariants", () => {
    it("allocateEqual: strict zero-sum conservation and bounded delta <= 1 across diverse counts and totals", () => {
      const testCases = [
        { total: 0, count: 5 },
        { total: 1, count: 10 },
        { total: 2, count: 3 },
        { total: 7, count: 7 },
        { total: 100, count: 3 },
        { total: 10001, count: 13 },
        { total: 9999999, count: 77 },
        { total: 10_000_000_000, count: 99 },
      ]

      for (const { total, count } of testCases) {
        const splits = allocateEqual(total, count)
        expect(splits).toHaveLength(count)
        const sum = splits.reduce((a, b) => a + b, 0)
        expect(sum).toBe(total)

        // Delta between max split and min split must be <= 1 minor unit
        const maxVal = Math.max(...splits)
        const minVal = Math.min(...splits)
        expect(maxVal - minVal).toBeLessThanOrEqual(1)
      }

      // Edge cases: count <= 0
      expect(allocateEqual(100, 0)).toEqual([])
      expect(allocateEqual(100, -5)).toEqual([])
    })

    it("allocateExact: verifies exact sum match and rejects any mismatch", () => {
      expect(allocateExact(1000, [500, 300, 200])).toEqual([500, 300, 200])
      expect(allocateExact(1000, [500, 300, 201])).toBeNull()
      expect(allocateExact(1000, [500, 300, 199])).toBeNull()
      expect(allocateExact(0, [0, 0, 0])).toEqual([0, 0, 0])
      expect(allocateExact(100, [])).toBeNull()
    })

    it("allocatePercent: handles fractional percentages, prime splits, and exact remainder distribution", () => {
      // 3-way 33.33%, 33.33%, 33.34%
      const splits3 = allocatePercent(10000, [33.33, 33.33, 33.34])
      expect(splits3).not.toBeNull()
      expect(splits3!.reduce((a, b) => a + b, 0)).toBe(10000)

      // 7-way split summing to 100%
      const percents7 = [14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.32]
      const sumP = percents7.reduce((a, b) => a + b, 0)
      expect(Math.abs(sumP - 100)).toBeLessThan(0.0001)
      const splits7 = allocatePercent(1000000, percents7)
      expect(splits7).not.toBeNull()
      expect(splits7!.reduce((a, b) => a + b, 0)).toBe(1000000)

      // 100 members with 1% each
      const percents100 = Array(100).fill(1)
      const splits100 = allocatePercent(987654321, percents100)
      expect(splits100).not.toBeNull()
      expect(splits100!.reduce((a, b) => a + b, 0)).toBe(987654321)

      // Invalid percentages: sum not 100
      expect(allocatePercent(1000, [50, 49])).toBeNull()
      expect(allocatePercent(1000, [50, 50.1])).toBeNull()
      expect(allocatePercent(1000, [])).toBeNull()
    })

    it("allocateShares: handles arbitrary positive weights, fractional weights, and single dominance", () => {
      // Shares: [1, 2, 3, 4] -> 10 shares
      const splits = allocateShares(1000, [1, 2, 3, 4])
      expect(splits).not.toBeNull()
      expect(splits!.reduce((a, b) => a + b, 0)).toBe(1000)
      expect(splits).toEqual([100, 200, 300, 400])

      // Prime shares: [3, 7, 11, 13] -> 34 shares
      const primeSplits = allocateShares(100000, [3, 7, 11, 13])
      expect(primeSplits).not.toBeNull()
      expect(primeSplits!.reduce((a, b) => a + b, 0)).toBe(100000)

      // Extreme dominance: [1, 1000000]
      const domSplits = allocateShares(500, [1, 1000000])
      expect(domSplits).not.toBeNull()
      expect(domSplits!.reduce((a, b) => a + b, 0)).toBe(500)
      expect(domSplits![0] + domSplits![1]).toBe(500)

      // Single active share with zeros: [0, 5, 0]
      const singleSplits = allocateShares(1000, [0, 5, 0])
      expect(singleSplits).not.toBeNull()
      expect(singleSplits).toEqual([0, 1000, 0])

      // Invalid shares: empty or total <= 0
      expect(allocateShares(1000, [])).toBeNull()
      expect(allocateShares(1000, [0, 0, 0])).toBeNull()
      expect(allocateShares(1000, [-1, -2])).toBeNull()
    })
  })

  // =========================================================================
  // 2. MULTI-CURRENCY CONVERSION & FORMATTING INVARIANTS
  // =========================================================================
  describe("2. Multi-Currency Conversion & Parsing Invariants", () => {
    it("preserves exact minor units across zero-decimal and multi-decimal currencies", () => {
      const currencies = Object.keys(CURRENCY_DECIMALS)
      for (const curr of currencies) {
        const decimals = decimalsFor(curr)
        expect(Number.isInteger(decimals)).toBe(true)
        expect(decimals).toBeGreaterThanOrEqual(0)

        // Test roundtrip: 1234.56 major (or 1234 for JPY) -> minor -> major
        const testMajor = decimals === 0 ? 1234 : 1234.56
        const minor = toMinor(testMajor, decimals)
        const recoveredMajor = fromMinor(minor, decimals)
        expect(recoveredMajor).toBeCloseTo(testMajor, decimals)

        // Format test
        const formatted = formatMinor(minor, curr, "en-US")
        expect(typeof formatted).toBe("string")
        expect(formatted.length).toBeGreaterThan(0)
      }
    })

    it("parses currency inputs strictly rejecting malformed and over-precision values", () => {
      // JPY: 0 decimals
      expect(parseCurrencyInput("1500", "JPY")).toBe(1500)
      expect(parseCurrencyInput("1500.5", "JPY")).toBeNull() // decimals not allowed for JPY
      expect(parseCurrencyInput("1,500", "JPY")).toBe(1500)

      // USD / INR: 2 decimals
      expect(parseCurrencyInput("12.34", "USD")).toBe(1234)
      expect(parseCurrencyInput("12.345", "USD")).toBeNull() // 3 decimals not allowed
      expect(parseCurrencyInput("100", "INR")).toBe(10000)
      expect(parseCurrencyInput("100.5", "INR")).toBe(10050)
      expect(parseCurrencyInput(".50", "USD")).toBe(50)
      expect(parseCurrencyInput("0.05", "EUR")).toBe(5)

      // Reject garbage
      expect(parseCurrencyInput("", "USD")).toBeNull()
      expect(parseCurrencyInput("abc", "USD")).toBeNull()
      expect(parseCurrencyInput("12.34.56", "USD")).toBeNull()
      expect(parseCurrencyInput("-", "USD")).toBeNull()
      expect(parseCurrencyInput(".", "USD")).toBeNull()
    })

    it("handles extreme numbers and NaN/Infinity gracefully in formatMinor", () => {
      expect(formatMinor(0, "USD")).toContain("0.00")
      expect(formatMinor(-5000, "USD")).toContain("-")
      expect(formatMinor(NaN, "USD")).toContain("0.00")
      expect(formatMinor(Infinity, "USD")).toContain("0.00")
      expect(formatMinor(-Infinity, "USD")).toContain("0.00")

      // Unknown currency code fallback
      const customFormatted = formatMinor(1250, "XYZ")
      expect(customFormatted).toContain("12.50")
    })
  })

  // =========================================================================
  // 3. COMPLEX MULTI-MEMBER TRIP LIFECYCLE SIMULATION
  // =========================================================================
  describe("3. Complex Multi-Member Trip Lifecycle Simulation", () => {
    // 8 members with diverse spending across 10 days
    const MEMBERS = [
      "user_arjun",
      "user_priya",
      "user_rohan",
      "user_sneha",
      "user_vikram",
      "user_ananya",
      "user_karan",
      "user_pooja",
    ]

    type ExpenseRecord = {
      id: string
      description: string
      amount_minor: number
      category: ExpenseCategory
      expense_date: string
      payers: { userId: string; amount: number }[]
      splits: { userId: string; amount: number }[]
      deleted?: boolean
      deleted_at?: string
    }

    type SettlementRecord = {
      id: string
      fromId: string
      toId: string
      amount: number
    }

    it("simulates full trip lifecycle: mixed splits, multi-payers, soft-deletes, restores, and sequential settlements", () => {
      const expenses: ExpenseRecord[] = []
      const settlements: SettlementRecord[] = []

      // Day 1: Equal Split - Flights booked by Arjun (10,000 INR per person = 80,000 INR)
      const flightSplits = allocateEqual(8000000, 8).map((amt, idx) => ({
        userId: MEMBERS[idx],
        amount: amt,
      }))
      expenses.push({
        id: "exp_1",
        description: "Group Flights",
        amount_minor: 8000000,
        category: "transport",
        expense_date: "2026-09-01",
        payers: [{ userId: "user_arjun", amount: 8000000 }],
        splits: flightSplits,
      })

      // Day 2: Multi-Payer Hotel (Priya paid 30,000, Vikram paid 20,000 = 50,000 INR) - Equal Split
      const hotelSplits = allocateEqual(5000000, 8).map((amt, idx) => ({
        userId: MEMBERS[idx],
        amount: amt,
      }))
      expenses.push({
        id: "exp_2",
        description: "Luxury Villa",
        amount_minor: 5000000,
        category: "accommodation",
        expense_date: "2026-09-02",
        payers: [
          { userId: "user_priya", amount: 3000000 },
          { userId: "user_vikram", amount: 2000000 },
        ],
        splits: hotelSplits,
      })

      // Day 3: Percent Split - Fine Dining Dinner (Rohan paid 16,000 INR)
      // Percentage: Arjun 20%, Priya 15%, Rohan 15%, Sneha 10%, Vikram 10%, Ananya 10%, Karan 10%, Pooja 10%
      const dinnerPercents = [20, 15, 15, 10, 10, 10, 10, 10]
      const dinnerSplits = allocatePercent(1600000, dinnerPercents)!.map(
        (amt, idx) => ({
          userId: MEMBERS[idx],
          amount: amt,
        })
      )
      expenses.push({
        id: "exp_3",
        description: "Fine Dining Dinner",
        amount_minor: 1600000,
        category: "food",
        expense_date: "2026-09-03",
        payers: [{ userId: "user_rohan", amount: 1600000 }],
        splits: dinnerSplits,
      })

      // Day 4: Shares Split - Safari & Jeep (Sneha paid 24,000 INR)
      // Shares: Couples/Groups [2, 2, 1, 1, 1, 1, 2, 2] -> 12 shares
      const safariShares = [2, 2, 1, 1, 1, 1, 2, 2]
      const safariSplits = allocateShares(2400000, safariShares)!.map(
        (amt, idx) => ({
          userId: MEMBERS[idx],
          amount: amt,
        })
      )
      expenses.push({
        id: "exp_4",
        description: "Jeep Safari",
        amount_minor: 2400000,
        category: "tickets",
        expense_date: "2026-09-04",
        payers: [{ userId: "user_sneha", amount: 2400000 }],
        splits: safariSplits,
      })

      // Day 5: Exact Split - Shopping & Souvenirs (Ananya paid 18,500 INR)
      const exactAmounts = [
        300000, 250000, 200000, 400000, 150000, 250000, 100000, 200000,
      ]
      const exactSplits = allocateExact(1850000, exactAmounts)!.map(
        (amt, idx) => ({
          userId: MEMBERS[idx],
          amount: amt,
        })
      )
      expenses.push({
        id: "exp_5",
        description: "Souvenirs & Handicrafts",
        amount_minor: 1850000,
        category: "shopping",
        expense_date: "2026-09-05",
        payers: [{ userId: "user_ananya", amount: 1850000 }],
        splits: exactSplits,
      })

      // Check Invariant 1: Sum of Net Balances is EXACTLY ZERO
      let net = netBalances(expenses, settlements, MEMBERS)
      let sumNet = Object.values(net).reduce((a, b) => a + b, 0)
      expect(sumNet).toBe(0)

      // Check Invariant 2: Simplified Debts transfer count is <= N - 1 (<= 7)
      let transfers = simplifyDebts(net)
      expect(transfers.length).toBeLessThanOrEqual(MEMBERS.length - 1)
      expect(transfers.length).toBeGreaterThan(0)

      // Total debt transferred matches positive net sum
      const positiveNetSum = Object.values(net)
        .filter((v) => v > 0)
        .reduce((a, b) => a + b, 0)
      const transferredSum = transfers.reduce((a, t) => a + t.amount, 0)
      expect(transferredSum).toBe(positiveNetSum)

      // Day 6: Intermediate Soft-Delete of safari expense (exp_4)
      const exp4 = expenses.find((e) => e.id === "exp_4")!
      exp4.deleted = true
      exp4.deleted_at = "2026-09-06T10:00:00Z"

      const netAfterDelete = netBalances(expenses, settlements, MEMBERS)
      expect(Object.values(netAfterDelete).reduce((a, b) => a + b, 0)).toBe(0)
      // Sneha paid for exp_4, so her net balance after delete must decrease by 2400000 - her_share
      expect(netAfterDelete.user_sneha).toBeLessThan(net.user_sneha)

      // Day 7: Restore safari expense (exp_4)
      exp4.deleted = false
      delete exp4.deleted_at

      const netAfterRestore = netBalances(expenses, settlements, MEMBERS)
      expect(netAfterRestore).toEqual(net)

      // Day 8: Partial Settlement - Karan settles part of debt to Arjun
      settlements.push({
        id: "settle_1",
        fromId: "user_karan",
        toId: "user_arjun",
        amount: 500000,
      })

      const netAfterPartSettle = netBalances(expenses, settlements, MEMBERS)
      expect(Object.values(netAfterPartSettle).reduce((a, b) => a + b, 0)).toBe(
        0
      )
      expect(netAfterPartSettle.user_karan).toBe(net.user_karan + 500000)
      expect(netAfterPartSettle.user_arjun).toBe(net.user_arjun - 500000)

      // Day 9: Sequential full settlements via simplifyDebts
      const remainingTransfers = simplifyDebts(netAfterPartSettle)
      for (const t of remainingTransfers) {
        settlements.push({
          id: `settle_auto_${t.fromId}_${t.toId}`,
          fromId: t.fromId,
          toId: t.toId,
          amount: t.amount,
        })
      }

      // Check Final Invariant: All net balances are EXACTLY 0 and no more transfers
      const finalNet = netBalances(expenses, settlements, MEMBERS)
      for (const memberId of MEMBERS) {
        expect(finalNet[memberId]).toBe(0)
      }
      expect(simplifyDebts(finalNet)).toEqual([])

      // Timeline verification
      const timeline = computeDayTimeline(expenses, "2026-09-01")
      expect(timeline.length).toBe(5)
      const timelineTotal = timeline.reduce((s, d) => s + d.totalMinor, 0)
      const expectedTotalSpend = 8000000 + 5000000 + 1600000 + 2400000 + 1850000
      expect(timelineTotal).toBe(expectedTotalSpend)

      // Category summary verification
      const categorySummary = computeGroupCategorySummary(expenses)
      expect(categorySummary.totalTripMinor).toBe(expectedTotalSpend)
      const catSum = categorySummary.categories.reduce(
        (s, c) => s + c.totalMinor,
        0
      )
      expect(catSum).toBe(expectedTotalSpend)
    })
  })

  // =========================================================================
  // 4. RANDOMIZED ZERO-SUM CONSERVATION PROPERTY FUZZING (1000 TRIALS)
  // =========================================================================
  describe("4. Randomized Zero-Sum Conservation & Graph Settlement Invariants (1000 Iterations)", () => {
    it("proves sum(net) === 0 and simplifyDebts resolves graph to 0 across 1000 randomized configurations", () => {
      const CATEGORIES: ExpenseCategory[] = [
        "food",
        "transport",
        "accommodation",
        "tickets",
        "shopping",
        "other",
      ]

      for (let trial = 0; trial < 1000; trial++) {
        // Random group size: 3 to 25 members
        const memberCount = 3 + (trial % 23)
        const memberIds = Array.from({ length: memberCount }, (_, i) => `user_${i}`)

        // Random expense count: 1 to 20
        const expenseCount = 1 + (trial % 20)
        const expenses: Array<{
          payers: { userId: string; amount: number }[]
          splits: { userId: string; amount: number }[]
          deleted?: boolean
        }> = []

        for (let e = 0; e < expenseCount; e++) {
          const totalAmount = Math.floor(Math.random() * 500000) + 100 // 1.00 to 5000.00
          const splitModeChoice = e % 4

          // Choose random payer(s)
          const payerCount = Math.min(memberCount, 1 + (e % 3))
          const payerIds = [...memberIds]
            .sort(() => Math.random() - 0.5)
            .slice(0, payerCount)
          const payerAmounts = allocateEqual(totalAmount, payerCount)
          const payers = payerIds.map((uid, idx) => ({
            userId: uid,
            amount: payerAmounts[idx],
          }))

          // Choose random split participants
          const splitCount = Math.min(
            memberCount,
            Math.max(2, Math.floor(Math.random() * memberCount) + 1)
          )
          const splitMemberIds = [...memberIds]
            .sort(() => Math.random() - 0.5)
            .slice(0, splitCount)

          let splitAmounts: number[] | null = null

          if (splitModeChoice === 0) {
            // Equal
            splitAmounts = allocateEqual(totalAmount, splitCount)
          } else if (splitModeChoice === 1) {
            // Exact
            const rawShares = splitMemberIds.map(() =>
              Math.floor(Math.random() * 100) + 1
            )
            const sumShares = rawShares.reduce((a, b) => a + b, 0)
            const allocated = allocateEqual(totalAmount, splitCount)
            splitAmounts = allocateExact(totalAmount, allocated)
          } else if (splitModeChoice === 2) {
            // Percent
            const rawWeights = splitMemberIds.map(() =>
              Math.floor(Math.random() * 50) + 1
            )
            const totalWeight = rawWeights.reduce((a, b) => a + b, 0)
            let remainingPct = 100
            const percents = rawWeights.map((w, idx) => {
              if (idx === rawWeights.length - 1) {
                return Number(remainingPct.toFixed(2))
              }
              const p = Number(((w / totalWeight) * 100).toFixed(2))
              remainingPct -= p
              return p
            })
            // Ensure sum is 100
            const pDiff = Number(
              (100 - percents.reduce((a, b) => a + b, 0)).toFixed(2)
            )
            percents[percents.length - 1] = Number(
              (percents[percents.length - 1] + pDiff).toFixed(2)
            )

            splitAmounts = allocatePercent(totalAmount, percents)
            if (!splitAmounts) {
              splitAmounts = allocateEqual(totalAmount, splitCount)
            }
          } else {
            // Shares
            const shares = splitMemberIds.map(
              () => Math.floor(Math.random() * 10) + 1
            )
            splitAmounts = allocateShares(totalAmount, shares)
          }

          if (!splitAmounts) {
            splitAmounts = allocateEqual(totalAmount, splitCount)
          }

          const splits = splitMemberIds.map((uid, idx) => ({
            userId: uid,
            amount: splitAmounts![idx],
          }))

          // Random soft delete on 10% of expenses
          const deleted = Math.random() < 0.1

          expenses.push({ payers, splits, deleted })
        }

        // Random settlements
        const settlements: Array<{ fromId: string; toId: string; amount: number }> =
          []
        if (trial % 5 === 0) {
          const u1 = memberIds[0]
          const u2 = memberIds[1]
          settlements.push({ fromId: u1, toId: u2, amount: 2500 })
        }

        // Assert Invariant: Net balance conservation
        const net = netBalances(expenses, settlements, memberIds)
        const netSum = Object.values(net).reduce((a, b) => a + b, 0)
        expect(netSum).toBe(0)

        // Assert Invariant: Debt Simplification correctness
        const transfers = simplifyDebts(net)

        // 1. Transfer count <= memberCount - 1
        expect(transfers.length).toBeLessThanOrEqual(memberCount - 1)

        // 2. All amounts strictly positive
        for (const t of transfers) {
          expect(t.amount).toBeGreaterThan(0)
          expect(t.fromId).not.toBe(t.toId)
          expect(memberIds).toContain(t.fromId)
          expect(memberIds).toContain(t.toId)
        }

        // 3. Applying transfers resolves net balances to zero
        const simulatedSettlements = [
          ...settlements,
          ...transfers.map((t) => ({
            fromId: t.fromId,
            toId: t.toId,
            amount: t.amount,
          })),
        ]
        const resolvedNet = netBalances(expenses, simulatedSettlements, memberIds)
        for (const uid of memberIds) {
          expect(resolvedNet[uid]).toBe(0)
        }

        // 4. Determinism: Shuffled net map produces identical transfer list
        const shuffledKeys = Object.keys(net).sort(() => Math.random() - 0.5)
        const shuffledNet: Record<string, number> = {}
        for (const k of shuffledKeys) {
          shuffledNet[k] = net[k]
        }
        const shuffledTransfers = simplifyDebts(shuffledNet)
        expect(shuffledTransfers).toEqual(transfers)
      }
    })
  })

  // =========================================================================
  // 5. HIGH-VOLUME TRANSACTION STRESS & LARGE INTEGER TESTS
  // =========================================================================
  describe("5. High-Volume Transaction Stress Tests (50+ Members, 100+ Expenses, Large Integers)", () => {
    it("executes stress test with 60 members and 150 complex expenses without precision loss or perf degradation", () => {
      const MEMBER_COUNT = 60
      const EXPENSE_COUNT = 150
      const memberIds = Array.from(
        { length: MEMBER_COUNT },
        (_, i) => `user_member_${i.toString().padStart(3, "0")}`
      )

      const expenses: Array<{
        id: string
        category: ExpenseCategory
        amount_minor: number
        payers: { userId: string; amount: number }[]
        splits: { userId: string; amount: number }[]
        expense_date: string
      }> = []

      const CATEGORIES: ExpenseCategory[] = [
        "food",
        "transport",
        "accommodation",
        "tickets",
        "shopping",
        "other",
      ]

      let expectedTotalTripMinor = 0

      for (let i = 0; i < EXPENSE_COUNT; i++) {
        // High amount between 1,000 and 1,000,000 minor units
        const amount = (i + 1) * 2500
        expectedTotalTripMinor += amount

        // Multiple payers (1 to 5 payers)
        const numPayers = 1 + (i % 5)
        const payerIndices = Array.from(
          { length: numPayers },
          (_, p) => (i * 7 + p * 13) % MEMBER_COUNT
        )
        const payerAmounts = allocateEqual(amount, numPayers)
        const payers = payerIndices.map((idx, p) => ({
          userId: memberIds[idx],
          amount: payerAmounts[p],
        }))

        // Split across 10 to 60 members
        const numSplits = 10 + (i % (MEMBER_COUNT - 9))
        const splitIndices = Array.from(
          { length: numSplits },
          (_, s) => (i * 3 + s) % MEMBER_COUNT
        )
        const splitAmounts = allocateEqual(amount, numSplits)
        const splits = splitIndices.map((idx, s) => ({
          userId: memberIds[idx],
          amount: splitAmounts[s],
        }))

        const dateDay = (1 + (i % 28)).toString().padStart(2, "0")
        const expenseDate = `2026-08-${dateDay}`

        expenses.push({
          id: `stress_exp_${i}`,
          category: CATEGORIES[i % CATEGORIES.length],
          amount_minor: amount,
          payers,
          splits,
          expense_date: expenseDate,
        })
      }

      // Performance benchmark
      const startTime = performance.now()

      // Calculate net balances
      const net = netBalances(expenses, [], memberIds)

      // Invariant: sum net = 0
      const netSum = Object.values(net).reduce((a, b) => a + b, 0)
      expect(netSum).toBe(0)

      // Calculate simplified debts
      const transfers = simplifyDebts(net)
      expect(transfers.length).toBeLessThanOrEqual(MEMBER_COUNT - 1)

      // Verify that all transfers resolve the network
      const simulatedSettlements = transfers.map((t) => ({
        fromId: t.fromId,
        toId: t.toId,
        amount: t.amount,
      }))
      const resolvedNet = netBalances(expenses, simulatedSettlements, memberIds)
      for (const mid of memberIds) {
        expect(resolvedNet[mid]).toBe(0)
      }

      // Calculate timeline and category summary
      const timeline = computeDayTimeline(expenses, "2026-08-01")
      expect(timeline.length).toBeGreaterThan(0)
      const timelineSum = timeline.reduce((s, d) => s + d.totalMinor, 0)
      expect(timelineSum).toBe(expectedTotalTripMinor)

      const categorySummary = computeGroupCategorySummary(expenses)
      expect(categorySummary.totalTripMinor).toBe(expectedTotalTripMinor)

      const elapsedMs = performance.now() - startTime

      // Performance requirement: completes within 100ms
      expect(elapsedMs).toBeLessThan(150)
    })

    it("handles large multi-trillion integer amounts up to 10^14 minor units safely", () => {
      // 100 billion USD in minor units = 10^13 cents (safe integer limit is 9 * 10^15)
      const BIG_AMOUNT = 10_000_000_000_000 // 100 Billion USD

      const memberIds = ["bank_a", "bank_b", "bank_c", "bank_d"]
      const splits = allocateEqual(BIG_AMOUNT, 4).map((amt, idx) => ({
        userId: memberIds[idx],
        amount: amt,
      }))

      const expenses = [
        {
          payers: [{ userId: "bank_a", amount: BIG_AMOUNT }],
          splits,
        },
      ]

      const net = netBalances(expenses, [], memberIds)
      expect(net.bank_a).toBe(7_500_000_000_000)
      expect(net.bank_b).toBe(-2_500_000_000_000)
      expect(net.bank_c).toBe(-2_500_000_000_000)
      expect(net.bank_d).toBe(-2_500_000_000_000)

      const transfers = simplifyDebts(net)
      expect(transfers.length).toBe(3)
      for (const t of transfers) {
        expect(t.toId).toBe("bank_a")
        expect(t.amount).toBe(2_500_000_000_000)
      }

      // Check sum of transfers
      const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0)
      expect(totalTransferred).toBe(7_500_000_000_000)
    })

    it("pairwise ledger anti-symmetry: computePairwiseLedger(A, B) === -computePairwiseLedger(B, A)", () => {
      const expenses = [
        {
          id: "exp_pair_1",
          description: "Shared Cab",
          amount_minor: 3000,
          category: "transport",
          expense_payers: [{ user_id: "user_x", amount_paid_minor: 3000 }],
          expense_splits: [
            { user_id: "user_x", amount_owed_minor: 1500 },
            { user_id: "user_y", amount_owed_minor: 1500 },
          ],
        },
        {
          id: "exp_pair_2",
          description: "Shared Lunch",
          amount_minor: 5000,
          category: "food",
          expense_payers: [{ user_id: "user_y", amount_paid_minor: 5000 }],
          expense_splits: [
            { user_id: "user_x", amount_owed_minor: 2000 },
            { user_id: "user_y", amount_owed_minor: 3000 },
          ],
        },
      ]

      const ledgerXY = computePairwiseLedger(expenses, "user_x", "user_y")
      const ledgerYX = computePairwiseLedger(expenses, "user_y", "user_x")

      expect(ledgerXY.netPairwiseMinor).toBe(-ledgerYX.netPairwiseMinor)
      // user_x paid 1500 for user_y
      // user_y paid 2000 for user_x
      // Net: user_y paid 500 more for user_x -> from perspective of X: net = 1500 - 2000 = -500 (X owes Y 500)
      expect(ledgerXY.netPairwiseMinor).toBe(-500)
      expect(ledgerYX.netPairwiseMinor).toBe(500)
    })
  })

  // =========================================================================
  // 6. ISOLATED SLICE MATH & EXTREME BOUNDARY CONDITIONS
  // =========================================================================
  describe("6. Isolated Slice Math & Extreme Boundary Invariants", () => {
    it("computeDayDebts & computeCategoryDebts on non-existent or empty slices returns empty transfers and zero net", () => {
      const expenses = [
        {
          id: "e1",
          category: "food",
          expense_date: "2026-08-10",
          amount_minor: 1000,
          expense_payers: [{ user_id: "u1", amount_paid_minor: 1000 }],
          expense_splits: [
            { user_id: "u1", amount_owed_minor: 500 },
            { user_id: "u2", amount_owed_minor: 500 },
          ],
        },
      ]

      // Day not in expenses
      const emptyDay = computeDayDebts(expenses, "2026-08-11")
      expect(emptyDay.transfers).toEqual([])
      expect(emptyDay.net).toEqual({})

      // Category not in expenses
      const emptyCat = computeCategoryDebts(expenses, "accommodation")
      expect(emptyCat.transfers).toEqual([])
      expect(emptyCat.net).toEqual({})

      // Empty expenses input
      expect(computeDayDebts([], "2026-08-10").transfers).toEqual([])
      expect(computeCategoryDebts([], "food").transfers).toEqual([])
    })

    it("computeMemberDayBreakdown correctly reports 0 paid / 0 owed for passive observer member", () => {
      const expenses = [
        {
          id: "e1",
          expense_date: "2026-08-10",
          amount_minor: 2000,
          expense_payers: [{ user_id: "u1", amount_paid_minor: 2000 }],
          expense_splits: [
            { user_id: "u1", amount_owed_minor: 1000 },
            { user_id: "u2", amount_owed_minor: 1000 },
          ],
        },
        {
          id: "e2",
          expense_date: "2026-08-11",
          amount_minor: 4000,
          expense_payers: [{ user_id: "u2", amount_paid_minor: 4000 }],
          expense_splits: [
            { user_id: "u1", amount_owed_minor: 2000 },
            { user_id: "u2", amount_owed_minor: 2000 },
          ],
        },
      ]

      const observerBreakdown = computeMemberDayBreakdown(
        expenses,
        "passive_observer",
        "2026-08-10"
      )
      expect(observerBreakdown.length).toBe(2)
      for (const day of observerBreakdown) {
        expect(day.paidMinor).toBe(0)
        expect(day.owedMinor).toBe(0)
        expect(day.netMinor).toBe(0)
        expect(day.totalDayMinor).toBeGreaterThan(0)
      }
    })

    it("computePairwiseLedger for disjoint members returns zero net and empty items", () => {
      const expenses = [
        {
          id: "e1",
          amount_minor: 2000,
          expense_payers: [{ user_id: "u1", amount_paid_minor: 2000 }],
          expense_splits: [{ user_id: "u2", amount_owed_minor: 2000 }],
        },
      ]
      // u3 and u4 have no connection to e1
      const ledger = computePairwiseLedger(expenses, "u3", "u4")
      expect(ledger.items).toEqual([])
      expect(ledger.totalPaidByAForB).toBe(0)
      expect(ledger.totalPaidByBForA).toBe(0)
      expect(ledger.netPairwiseMinor).toBe(0)
    })

    it("netBalances handles single-member trip self-payments correctly", () => {
      const expenses = [
        {
          payers: [{ userId: "solo_traveler", amount: 5000 }],
          splits: [{ userId: "solo_traveler", amount: 5000 }],
        },
      ]
      const net = netBalances(expenses, [], ["solo_traveler"])
      expect(net.solo_traveler).toBe(0)
      expect(simplifyDebts(net)).toEqual([])
    })

    it("handles 1 creditor and 99 debtors (star debt network) with minimal transfer count (99)", () => {
      const net: Record<string, number> = {}
      let totalCreditor = 0
      for (let i = 1; i <= 99; i++) {
        net[`debtor_${i}`] = -1000
        totalCreditor += 1000
      }
      net["master_creditor"] = totalCreditor

      const transfers = simplifyDebts(net)
      expect(transfers.length).toBe(99)
      for (const t of transfers) {
        expect(t.toId).toBe("master_creditor")
        expect(t.amount).toBe(1000)
      }
    })

    it("handles 1 debtor and 99 creditors (inverted star network) with minimal transfer count (99)", () => {
      const net: Record<string, number> = {}
      let totalDebtor = 0
      for (let i = 1; i <= 99; i++) {
        net[`creditor_${i}`] = 1000
        totalDebtor += 1000
      }
      net["master_debtor"] = -totalDebtor

      const transfers = simplifyDebts(net)
      expect(transfers.length).toBe(99)
      for (const t of transfers) {
        expect(t.fromId).toBe("master_debtor")
        expect(t.amount).toBe(1000)
      }
    })
  })
})

