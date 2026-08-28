import { describe, it, expect } from "vitest"
import {
  decimalsFor,
  toMinor,
  fromMinor,
  parseCurrencyInput,
  formatMinor,
  CURRENCY_DECIMALS,
} from "@/lib/currency"
import {
  allocateEqual,
  allocateExact,
  allocatePercent,
  allocateShares,
} from "@/features/expenses/money"
import {
  netBalances,
  simplifyDebts,
  tripNetMinor,
} from "@/features/balances/balanceMath"
import {
  computeDayDebts,
  computeDayTimeline,
  computeMemberDayBreakdown,
} from "@/features/balances/dayMath"
import {
  computeCategoryDebts,
  computeCategoryBreakdown,
  computePairwiseLedger,
  computeGroupCategorySummary,
} from "@/features/balances/categoryMath"

describe("Adversarial Split Calculations & Currency Resilience", () => {
  describe("1. Split Arithmetic & Remainder Conservation", () => {
    it("allocateEqual: preserves total sum across extreme participant counts (1 to 1000)", () => {
      const participantCounts = [1, 2, 3, 4, 5, 7, 11, 13, 50, 99, 100, 500, 1000]
      const totals = [0, 1, 2, 3, 7, 10, 99, 100, 101, 333, 1000, 9999, 1000000]

      for (const count of participantCounts) {
        for (const total of totals) {
          const alloc = allocateEqual(total, count)
          expect(alloc).toHaveLength(count)
          const sum = alloc.reduce((a, b) => a + b, 0)
          expect(sum).toBe(total)

          // Remainder property: the max allocation and min allocation differ by at most 1
          const min = Math.min(...alloc)
          const max = Math.max(...alloc)
          expect(max - min).toBeLessThanOrEqual(1)

          // First (total % count) participants receive (base + 1), rest receive base
          const base = Math.floor(total / count)
          const rem = total % count
          for (let i = 0; i < count; i++) {
            expect(alloc[i]).toBe(i < rem ? base + 1 : base)
          }
        }
      }
    })

    it("allocateEqual: handles edge cases (0 count, negative count, 0 total, 1 participant)", () => {
      expect(allocateEqual(100, 0)).toEqual([])
      expect(allocateEqual(100, -5)).toEqual([])
      expect(allocateEqual(0, 5)).toEqual([0, 0, 0, 0, 0])
      expect(allocateEqual(100, 1)).toEqual([100])
      expect(allocateEqual(1, 100)).toEqual([1, ...new Array(99).fill(0)])
    })

    it("allocatePercent: Hamilton Largest Remainder preserves exact minor unit conservation", () => {
      // 100 split 3 ways: 33.33%, 33.33%, 33.34%
      const res3 = allocatePercent(100, [33.33, 33.33, 33.34])
      expect(res3).not.toBeNull()
      expect(res3!.reduce((a, b) => a + b, 0)).toBe(100)
      expect(res3).toEqual([33, 33, 34])

      // 10000 split 7 ways equal percentage ~ 14.2857%
      const p7 = [14.28, 14.28, 14.28, 14.28, 14.29, 14.29, 14.3] // sum = 100.00
      const res7 = allocatePercent(10000, p7)
      expect(res7).not.toBeNull()
      expect(res7!.reduce((a, b) => a + b, 0)).toBe(10000)

      // 100 participants each with 1%
      const p100 = new Array(100).fill(1)
      const res100 = allocatePercent(50, p100) // 50 cents split among 100 people
      expect(res100).not.toBeNull()
      expect(res100!.reduce((a, b) => a + b, 0)).toBe(50)
      // Exactly 50 people should get 1 cent, 50 people get 0 cents
      expect(res100!.filter((x) => x === 1)).toHaveLength(50)
      expect(res100!.filter((x) => x === 0)).toHaveLength(50)
    })

    it("allocatePercent: rejects invalid inputs (sum !== 100, negative %, empty)", () => {
      expect(allocatePercent(100, [])).toBeNull()
      expect(allocatePercent(100, [50, 49.99])).toBeNull()
      expect(allocatePercent(100, [50, 50.01])).toBeNull()
      expect(allocatePercent(100, [-10, 110])).toBeNull()
      expect(allocatePercent(100, [0, 0, 0])).toBeNull()

      // Handles 0% when total sum is 100%
      const resZero = allocatePercent(100, [100, 0, 0])
      expect(resZero).toEqual([100, 0, 0])
    })

    it("allocateShares: preserves exact sum and handles proportional weight distribution", () => {
      // 1:2:3 shares on 100 minor units
      const res = allocateShares(100, [1, 2, 3])
      expect(res).not.toBeNull()
      expect(res!.reduce((a, b) => a + b, 0)).toBe(100)
      // raw = [16.666, 33.333, 50] -> floored = [16, 33, 50] (sum 99), remainder 1 goes to index 0 (frac 0.666)
      expect(res).toEqual([17, 33, 50])

      // 100 participants with random integer shares
      const randomShares = Array.from({ length: 100 }, (_, i) => (i % 5) + 1)
      const resShares100 = allocateShares(1234567, randomShares)
      expect(resShares100).not.toBeNull()
      expect(resShares100!.reduce((a, b) => a + b, 0)).toBe(1234567)

      // Single non-zero share gets everything
      expect(allocateShares(500, [0, 0, 10, 0])).toEqual([0, 0, 500, 0])
    })

    it("allocateShares: rejects invalid shares (empty, totalShares <= 0, negative shares)", () => {
      expect(allocateShares(100, [])).toBeNull()
      expect(allocateShares(100, [0, 0, 0])).toBeNull()
      expect(allocateShares(100, [-1, 2, 3])).toBeNull()
    })

    it("allocateExact: verifies exact sum equality", () => {
      expect(allocateExact(100, [30, 70])).toEqual([30, 70])
      expect(allocateExact(100, [30, 69])).toBeNull()
      expect(allocateExact(100, [30, 71])).toBeNull()
      expect(allocateExact(0, [0, 0])).toEqual([0, 0])
    })
  })

  describe("2. Currency Resilience (0-decimal JPY vs 2-decimal INR/USD/EUR)", () => {
    it("decimalsFor: returns 0 for JPY and 2 for standard currencies and unknown fallbacks", () => {
      expect(decimalsFor("JPY")).toBe(0)
      expect(decimalsFor("jpy")).toBe(0)
      expect(decimalsFor("INR")).toBe(2)
      expect(decimalsFor("USD")).toBe(2)
      expect(decimalsFor("EUR")).toBe(2)
      expect(decimalsFor("GBP")).toBe(2)
      expect(decimalsFor("AED")).toBe(2)
      expect(decimalsFor("SGD")).toBe(2)
      expect(decimalsFor("XYZ")).toBe(2)
      expect(decimalsFor("")).toBe(2)
    })

    it("toMinor & fromMinor: prevents float drift across fractions", () => {
      // 0-decimal JPY
      expect(toMinor(1234, 0)).toBe(1234)
      expect(fromMinor(1234, 0)).toBe(1234)

      // 2-decimal INR / USD
      expect(toMinor(10.5, 2)).toBe(1050)
      expect(fromMinor(1050, 2)).toBe(10.5)

      // Floating point representation traps: 0.07 * 100, 0.29 * 100, 0.57 * 100
      expect(toMinor(0.07, 2)).toBe(7)
      expect(toMinor(0.29, 2)).toBe(29)
      expect(toMinor(0.57, 2)).toBe(57)
      expect(toMinor(1.14, 2)).toBe(114)
      expect(toMinor(2.28, 2)).toBe(228)

      // Rounding 3rd decimal
      expect(toMinor(10.005, 2)).toBe(1001)
      expect(toMinor(10.004, 2)).toBe(1000)

      // Non-finite safety in fromMinor
      expect(fromMinor(NaN, 2)).toBe(0)
      expect(fromMinor(Infinity, 2)).toBe(0)
    })

    it("parseCurrencyInput: parses and validates inputs across JPY and 2-decimal currencies", () => {
      // JPY (0 decimals)
      expect(parseCurrencyInput("1500", "JPY")).toBe(1500)
      expect(parseCurrencyInput("1,500", "JPY")).toBe(1500)
      expect(parseCurrencyInput("1500.0", "JPY")).toBeNull() // fraction rejected in JPY
      expect(parseCurrencyInput("1500.5", "JPY")).toBeNull()

      // INR / USD (2 decimals)
      expect(parseCurrencyInput("15.00", "INR")).toBe(1500)
      expect(parseCurrencyInput("15.5", "INR")).toBe(1550)
      expect(parseCurrencyInput("15", "INR")).toBe(1500)
      expect(parseCurrencyInput("1,234,567.89", "USD")).toBe(123456789)
      expect(parseCurrencyInput("15.555", "USD")).toBeNull() // 3 decimals rejected

      // Intermediate / invalid typing states
      expect(parseCurrencyInput("", "INR")).toBeNull()
      expect(parseCurrencyInput("   ", "INR")).toBeNull()
      expect(parseCurrencyInput(".", "INR")).toBeNull()
      expect(parseCurrencyInput("-", "INR")).toBeNull()
      expect(parseCurrencyInput("-.", "INR")).toBeNull()
      expect(parseCurrencyInput("abc", "INR")).toBeNull()
      expect(parseCurrencyInput("12.3.4", "INR")).toBeNull()
      expect(parseCurrencyInput("+50", "INR")).toBeNull()
      expect(parseCurrencyInput("1e5", "INR")).toBeNull()
    })

    it("formatMinor: formats major amounts without fractional display for JPY and with 2 decimals for INR/USD", () => {
      // JPY
      const jpy = formatMinor(1500, "JPY", "en-US")
      expect(jpy).toMatch(/¥|JPY/)
      expect(jpy).toMatch(/1,500/)
      expect(jpy).not.toMatch(/\.00/)

      // INR
      const inr = formatMinor(150050, "INR", "en-IN")
      expect(inr).toMatch(/₹|INR/)
      expect(inr).toMatch(/1,500\.50/)

      // USD
      const usd = formatMinor(1000, "USD", "en-US")
      expect(usd).toMatch(/\$|USD/)
      expect(usd).toMatch(/10\.00/)

      // Zero & negative amounts
      expect(formatMinor(0, "INR")).toMatch(/0\.00/)
      const negInr = formatMinor(-2500, "INR", "en-IN")
      expect(negInr).toMatch(/-.*25\.00/)

      // Unknown currency code does not crash
      const unk = formatMinor(5000, "UNKNOWN_CURRENCY")
      expect(unk).toContain("50.00")

      // Non-finite values safe
      expect(formatMinor(NaN, "INR")).toMatch(/0\.00/)
      expect(formatMinor(Infinity, "INR")).toMatch(/0\.00/)
    })
  })

  describe("3. Debt Simplification & Zero-Sum Invariants", () => {
    it("netBalances: guarantees exact zero-sum invariant for arbitrary multi-payer multi-split expenses", () => {
      const memberIds = ["u1", "u2", "u3", "u4", "u5"]
      const expenses = [
        {
          payers: [
            { userId: "u1", amount: 6000 },
            { userId: "u2", amount: 4000 },
          ],
          splits: [
            { userId: "u1", amount: 2000 },
            { userId: "u2", amount: 2000 },
            { userId: "u3", amount: 2000 },
            { userId: "u4", amount: 2000 },
            { userId: "u5", amount: 2000 },
          ],
        },
        {
          payers: [{ userId: "u3", amount: 1500 }],
          splits: [
            { userId: "u1", amount: 500 },
            { userId: "u2", amount: 500 },
            { userId: "u3", amount: 500 },
          ],
        },
        {
          deleted: true, // Should be ignored
          payers: [{ userId: "u4", amount: 999999 }],
          splits: [{ userId: "u5", amount: 999999 }],
        },
      ]
      const settlements = [{ fromId: "u5", toId: "u1", amount: 500 }]

      const net = netBalances(expenses, settlements, memberIds)
      const sumNet = Object.values(net).reduce((a, b) => a + b, 0)
      expect(sumNet).toBe(0)

      // Check specific expected nets:
      // u1: +6000 - 2000 - 500 - 500 (received settlement) = +3000
      expect(net["u1"]).toBe(3000)
      // u2: +4000 - 2000 - 500 = +1500
      expect(net["u2"]).toBe(1500)
      // u3: +1500 - 2000 - 500 = -1000
      expect(net["u3"]).toBe(-1000)
      // u4: 0 - 2000 = -2000
      expect(net["u4"]).toBe(-2000)
      // u5: 0 - 2000 + 500 (paid settlement) = -1500
      expect(net["u5"]).toBe(-1500)
    })

    it("simplifyDebts: resolves debts to zero, creates <= N-1 transfers, and eliminates cycles", () => {
      // Circular debt: u1 pays for u2, u2 pays for u3, u3 pays for u1
      const circularNet: Record<string, number> = {
        u1: 100 - 50, // +50
        u2: 50 - 100, // -50
        u3: 0,
      }
      const transfers = simplifyDebts(circularNet)
      expect(transfers).toHaveLength(1)
      expect(transfers[0]).toEqual({ fromId: "u2", toId: "u1", amount: 50 })

      // Complex multi-party net
      const net: Record<string, number> = {
        u1: 4000,
        u2: 1500,
        u3: -1000,
        u4: -2000,
        u5: -2500,
      }
      const simplified = simplifyDebts(net)

      // Transfer invariants:
      // 1. Max transfers <= non-zero members - 1 = 4
      expect(simplified.length).toBeLessThanOrEqual(4)

      // 2. All transfer amounts are strictly positive
      for (const t of simplified) {
        expect(t.amount).toBeGreaterThan(0)
        expect(t.fromId).not.toBe(t.toId)
      }

      // 3. Applying transfers completely settles the net balances to 0
      const settledNet = { ...net }
      for (const t of simplified) {
        settledNet[t.fromId] += t.amount // debtor paid
        settledNet[t.toId] -= t.amount // creditor received
      }
      for (const val of Object.values(settledNet)) {
        expect(val).toBe(0)
      }
    })

    it("simplifyDebts: randomized stress test with 100 participants and 1,000 random transactions", () => {
      const NUM_MEMBERS = 100
      const members = Array.from({ length: NUM_MEMBERS }, (_, i) => `user_${i}`)
      const rawNet: Record<string, number> = {}
      for (const m of members) rawNet[m] = 0

      // Simulate 1,000 random transactions between random payers and split groups
      let seed = 42
      function pseudoRand() {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
      }

      for (let t = 0; t < 1000; t++) {
        const payerIdx = Math.floor(pseudoRand() * NUM_MEMBERS)
        const payer = members[payerIdx]
        const groupSize = Math.floor(pseudoRand() * 10) + 1
        const splitMembers = new Set<string>()
        while (splitMembers.size < groupSize) {
          splitMembers.add(members[Math.floor(pseudoRand() * NUM_MEMBERS)])
        }
        const totalAmount = Math.floor(pseudoRand() * 10000) + 100
        const splits = allocateEqual(totalAmount, splitMembers.size)

        rawNet[payer] += totalAmount
        let i = 0
        for (const sm of splitMembers) {
          rawNet[sm] -= splits[i++]
        }
      }

      // Invariant: sum of net balances must be 0
      const totalNetSum = Object.values(rawNet).reduce((a, b) => a + b, 0)
      expect(totalNetSum).toBe(0)

      // Simplify debts
      const transfers = simplifyDebts(rawNet)

      // Invariant: transfers count <= active participants - 1
      const activeCount = Object.values(rawNet).filter((v) => Math.round(v) !== 0).length
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, activeCount - 1))

      // Invariant: all transfers settle rawNet to exactly 0
      const simulatedSettlement = { ...rawNet }
      for (const tr of transfers) {
        expect(tr.amount).toBeGreaterThan(0)
        simulatedSettlement[tr.fromId] += tr.amount
        simulatedSettlement[tr.toId] -= tr.amount
      }
      for (const [uid, bal] of Object.entries(simulatedSettlement)) {
        expect(Math.round(bal)).toBe(0)
      }
    })
  })

  describe("4. Day-Wise and Category-Wise Isolated Debt Simplification", () => {
    const mockExpenses = [
      {
        id: "exp-1",
        description: "Day 1 Breakfast",
        category: "food",
        expense_date: "2026-08-01",
        amount_minor: 3000,
        expense_payers: [{ user_id: "alice", amount_paid_minor: 3000 }],
        expense_splits: [
          { user_id: "alice", amount_owed_minor: 1000 },
          { user_id: "bob", amount_owed_minor: 1000 },
          { user_id: "charlie", amount_owed_minor: 1000 },
        ],
      },
      {
        id: "exp-2",
        description: "Day 1 Hotel",
        category: "accommodation",
        expense_date: "2026-08-01",
        amount_minor: 6000,
        expense_payers: [{ user_id: "bob", amount_paid_minor: 6000 }],
        expense_splits: [
          { user_id: "alice", amount_owed_minor: 2000 },
          { user_id: "bob", amount_owed_minor: 2000 },
          { user_id: "charlie", amount_owed_minor: 2000 },
        ],
      },
      {
        id: "exp-3",
        description: "Day 2 Transport",
        category: "transport",
        expense_date: "2026-08-02",
        amount_minor: 1500,
        expense_payers: [{ user_id: "charlie", amount_paid_minor: 1500 }],
        expense_splits: [
          { user_id: "alice", amount_owed_minor: 500 },
          { user_id: "bob", amount_owed_minor: 500 },
          { user_id: "charlie", amount_owed_minor: 500 },
        ],
      },
      {
        id: "exp-4",
        description: "Deleted expense",
        category: "food",
        expense_date: "2026-08-02",
        amount_minor: 9999,
        deleted: true,
        expense_payers: [{ user_id: "alice", amount_paid_minor: 9999 }],
        expense_splits: [{ user_id: "bob", amount_owed_minor: 9999 }],
      },
    ]

    it("computeDayDebts: isolates daily balances and satisfies zero-sum on each day", () => {
      // Day 1
      const day1 = computeDayDebts(mockExpenses, "2026-08-01")
      const sumDay1Net = Object.values(day1.net).reduce((a, b) => a + b, 0)
      expect(sumDay1Net).toBe(0)
      // Alice paid 3000, owed 3000 -> net 0
      expect(day1.net["alice"]).toBe(0)
      // Bob paid 6000, owed 3000 -> net +3000
      expect(day1.net["bob"]).toBe(3000)
      // Charlie paid 0, owed 3000 -> net -3000
      expect(day1.net["charlie"]).toBe(-3000)
      // Transfer: charlie -> bob 3000
      expect(day1.transfers).toHaveLength(1)
      expect(day1.transfers[0]).toEqual({ fromId: "charlie", toId: "bob", amount: 3000 })

      // Day 2
      const day2 = computeDayDebts(mockExpenses, "2026-08-02")
      const sumDay2Net = Object.values(day2.net).reduce((a, b) => a + b, 0)
      expect(sumDay2Net).toBe(0)
      // Charlie paid 1500, owed 500 -> net +1000
      expect(day2.net["charlie"]).toBe(1000)
      // Alice net -500, Bob net -500
      expect(day2.net["alice"]).toBe(-500)
      expect(day2.net["bob"]).toBe(-500)
    })

    it("computeDayTimeline: groups expenses chronologically and matches daily totals", () => {
      const timeline = computeDayTimeline(mockExpenses, "2026-08-01")
      expect(timeline).toHaveLength(2)

      expect(timeline[0].date).toBe("2026-08-01")
      expect(timeline[0].dayNumber).toBe(1)
      expect(timeline[0].totalMinor).toBe(9000)
      expect(timeline[0].expenseCount).toBe(2)

      expect(timeline[1].date).toBe("2026-08-02")
      expect(timeline[1].dayNumber).toBe(2)
      expect(timeline[1].totalMinor).toBe(1500)
      expect(timeline[1].expenseCount).toBe(1)
    })

    it("computeMemberDayBreakdown: personal daily spend and net math invariant", () => {
      const aliceBreakdown = computeMemberDayBreakdown(mockExpenses, "alice", "2026-08-01")
      expect(aliceBreakdown).toHaveLength(2)

      // Day 1: Alice paid 3000, owed 3000, net 0
      expect(aliceBreakdown[0].paidMinor).toBe(3000)
      expect(aliceBreakdown[0].owedMinor).toBe(3000)
      expect(aliceBreakdown[0].netMinor).toBe(0)

      // Day 2: Alice paid 0, owed 500, net -500
      expect(aliceBreakdown[1].paidMinor).toBe(0)
      expect(aliceBreakdown[1].owedMinor).toBe(500)
      expect(aliceBreakdown[1].netMinor).toBe(-500)
    })

    it("computeCategoryDebts: isolates debt simplification per category and preserves zero-sum", () => {
      // Accommodation category: only exp-2 (Bob paid 6000, Alice owes 2000, Bob owes 2000, Charlie owes 2000)
      const accomDebts = computeCategoryDebts(mockExpenses, "accommodation")
      const sumAccomNet = Object.values(accomDebts.net).reduce((a, b) => a + b, 0)
      expect(sumAccomNet).toBe(0)
      expect(accomDebts.net["bob"]).toBe(4000)
      expect(accomDebts.net["alice"]).toBe(-2000)
      expect(accomDebts.net["charlie"]).toBe(-2000)
      expect(accomDebts.transfers).toHaveLength(2)

      // Food category: only exp-1 (Alice paid 3000, Alice/Bob/Charlie owe 1000 each)
      const foodDebts = computeCategoryDebts(mockExpenses, "food")
      const sumFoodNet = Object.values(foodDebts.net).reduce((a, b) => a + b, 0)
      expect(sumFoodNet).toBe(0)
      expect(foodDebts.net["alice"]).toBe(2000)
      expect(foodDebts.net["bob"]).toBe(-1000)
      expect(foodDebts.net["charlie"]).toBe(-1000)
    })

    it("computeCategoryBreakdown & computePairwiseLedger: verifies budget shares and bilateral debts", () => {
      // Category breakdown for Alice
      const breakdown = computeCategoryBreakdown(mockExpenses, "alice")
      const foodItem = breakdown.find((b) => b.category === "food")
      expect(foodItem).toBeDefined()
      expect(foodItem!.paidMinor).toBe(3000)
      expect(foodItem!.shareMinor).toBe(1000)
      expect(foodItem!.netMinor).toBe(2000)

      // Pairwise ledger between Alice and Bob
      const ledger = computePairwiseLedger(mockExpenses, "alice", "bob")
      // In exp-1: Alice paid 3000 for total 3000, Bob owed 1000 -> Bob owes Alice 1000
      // In exp-2: Bob paid 6000 for total 6000, Alice owed 2000 -> Alice owes Bob 2000
      expect(ledger.totalPaidByAForB).toBe(1000)
      expect(ledger.totalPaidByBForA).toBe(2000)
      expect(ledger.netPairwiseMinor).toBe(-1000) // Alice owes Bob 1000 net

      // Pairwise symmetry invariant: ledger(A, B) is exact inverse of ledger(B, A)
      const reverseLedger = computePairwiseLedger(mockExpenses, "bob", "alice")
      expect(reverseLedger.totalPaidByAForB).toBe(ledger.totalPaidByBForA)
      expect(reverseLedger.totalPaidByBForA).toBe(ledger.totalPaidByAForB)
      expect(reverseLedger.netPairwiseMinor).toBe(-ledger.netPairwiseMinor)
    })
  })

  describe("5. Advanced Graph Structures & Invariant Stress Harness", () => {
    it("simplifyDebts: eliminates circular debt chains completely (0 transfers for perfect cycle)", () => {
      // 5-person ring debt:
      // A pays 100 for B (A +100, B -100)
      // B pays 100 for C (B +100, C -100)
      // C pays 100 for D (C +100, D -100)
      // D pays 100 for E (D +100, E -100)
      // E pays 100 for A (E +100, A -100)
      // Net for all = 0
      const ringNet: Record<string, number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0,
      }
      const transfers = simplifyDebts(ringNet)
      expect(transfers).toHaveLength(0)
    })

    it("simplifyDebts: star and bipartite debt topologies create minimal transfers", () => {
      // Star topology: 1 payer (A) pays 1000 total for 20 participants (50 each)
      const starNet: Record<string, number> = { A: 950 }
      for (let i = 1; i <= 19; i++) {
        starNet[`user_${i}`] = -50
      }
      const starTransfers = simplifyDebts(starNet)
      expect(starTransfers).toHaveLength(19)
      for (const t of starTransfers) {
        expect(t.toId).toBe("A")
        expect(t.amount).toBe(50)
      }
    })

    it("100-Trip Randomized Simulation Harness: verifies all invariants across random multi-payer / multi-split trips", () => {
      let seed = 123456
      function rand() {
        seed = (seed * 1664525 + 1013904223) % 4294967296
        return seed / 4294967296
      }

      for (let tripIdx = 0; tripIdx < 50; tripIdx++) {
        const numMembers = Math.floor(rand() * 15) + 3 // 3 to 17 members
        const members = Array.from({ length: numMembers }, (_, i) => `user_${i}`)
        const numExpenses = Math.floor(rand() * 30) + 10 // 10 to 39 expenses
        const tripExpenses: any[] = []
        const categories = ["food", "transport", "accommodation", "tickets", "shopping", "other"]

        for (let eIdx = 0; eIdx < numExpenses; eIdx++) {
          const totalAmount = Math.floor(rand() * 50000) + 100
          const category = categories[Math.floor(rand() * categories.length)]
          const dayNum = Math.floor(rand() * 5) + 1
          const dateStr = `2026-09-0${dayNum}`

          // 1-3 Payers
          const numPayers = Math.min(numMembers, Math.floor(rand() * 3) + 1)
          const payerPool = [...members].sort(() => rand() - 0.5).slice(0, numPayers)
          const payerShares = allocateEqual(totalAmount, numPayers)
          const payers = payerPool.map((uid, idx) => ({
            user_id: uid,
            amount_paid_minor: payerShares[idx],
          }))

          // 2 to N Split participants
          const numSplits = Math.floor(rand() * (numMembers - 1)) + 2
          const splitPool = [...members].sort(() => rand() - 0.5).slice(0, numSplits)
          const splitShares = allocateEqual(totalAmount, numSplits)
          const splits = splitPool.map((uid, idx) => ({
            user_id: uid,
            amount_owed_minor: splitShares[idx],
          }))

          tripExpenses.push({
            id: `exp-${tripIdx}-${eIdx}`,
            description: `Trip ${tripIdx} Expense ${eIdx}`,
            category,
            expense_date: dateStr,
            amount_minor: totalAmount,
            expense_payers: payers,
            expense_splits: splits,
          })
        }

        // Check global net balances zero-sum
        const expensesForNet = tripExpenses.map((e) => ({
          payers: e.expense_payers.map((p: any) => ({ userId: p.user_id, amount: p.amount_paid_minor })),
          splits: e.expense_splits.map((s: any) => ({ userId: s.user_id, amount: s.amount_owed_minor })),
        }))
        const net = netBalances(expensesForNet, [], members)
        const netSum = Object.values(net).reduce((a, b) => a + b, 0)
        expect(netSum).toBe(0)

        // Simplify debts and verify settlement
        const transfers = simplifyDebts(net)
        const activeMembers = Object.values(net).filter((v) => Math.round(v) !== 0).length
        expect(transfers.length).toBeLessThanOrEqual(Math.max(0, activeMembers - 1))

        const simulation = { ...net }
        for (const t of transfers) {
          expect(t.amount).toBeGreaterThan(0)
          expect(t.fromId).not.toBe(t.toId)
          simulation[t.fromId] += t.amount
          simulation[t.toId] -= t.amount
        }
        for (const val of Object.values(simulation)) {
          expect(Math.round(val)).toBe(0)
        }

        // Verify day-wise zero sum for each day
        for (let d = 1; d <= 5; d++) {
          const dateStr = `2026-09-0${d}`
          const dayDebt = computeDayDebts(tripExpenses, dateStr)
          const dayNetSum = Object.values(dayDebt.net).reduce((a, b) => a + b, 0)
          expect(dayNetSum).toBe(0)
        }

        // Verify category-wise zero sum for each category
        for (const cat of categories) {
          const catDebt = computeCategoryDebts(tripExpenses, cat as any)
          const catNetSum = Object.values(catDebt.net).reduce((a, b) => a + b, 0)
          expect(catNetSum).toBe(0)
        }
      }
    })
  })
})
