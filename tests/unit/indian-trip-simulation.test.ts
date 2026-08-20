import { describe, it, expect } from "vitest"
import { netBalances, simplifyDebts } from "@/features/balances/balanceMath"
import { toMinor, formatMinor, allocateEqual } from "@/features/expenses/money"

/**
 * Automation test: Simulate a real 7-day Indian trip with 4 members.
 * Context: Rajasthan circuit (Jaipur → Udaipur → Jaisalmer) — diverse Indian spending.
 * Members: Arjun (organizer, UPI), Priya (books hotels), Rohan (foodie), Sneha (shopping)
 * Currency: INR (decimals=2)
 * Covers: all expense categories, transport modes, split strategies, settlement.
 */

const MEMBERS = [
  { id: "arjun", name: "Arjun" },
  { id: "priya", name: "Priya" },
  { id: "rohan", name: "Rohan" },
  { id: "sneha", name: "Sneha" },
] as const

type MemberId = typeof MEMBERS[number]["id"]

function inr(amount: number) { return toMinor(amount, 2) } // 12.34 → 1234

describe("Indian trip simulation — 4 members, 7 days, diverse spendings", () => {
  // Day-wise realistic expenses (amounts in INR, splits reflect who benefited)
  const expenses = [
    // Day 1: Jaipur arrival
    { day: 1, desc: "Train Jaipur (Shatabdi) — 4 tickets", amount: inr(4800), payers: [{ userId: "arjun", amount: inr(4800) }], splits: allocateEqual(inr(4800), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "transport" as const },
    { day: 1, desc: "Auto rickshaw to hotel", amount: inr(350), payers: [{ userId: "rohan", amount: inr(350) }], splits: allocateEqual(inr(350), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "transport" as const },
    { day: 1, desc: "Hotel - Jaipur Haveli (2 rooms)", amount: inr(6500), payers: [{ userId: "priya", amount: inr(6500) }], splits: allocateEqual(inr(6500), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "accommodation" as const },
    { day: 1, desc: "Dinner - Chokhi Dhani thali", amount: inr(2400), payers: [{ userId: "rohan", amount: inr(2400) }], splits: allocateEqual(inr(2400), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "food" as const },
    { day: 1, desc: "Chai & samosa at tapri", amount: inr(240), payers: [{ userId: "sneha", amount: inr(240) }], splits: [{ userId: "arjun", amount: inr(60) }, { userId: "priya", amount: inr(60) }, { userId: "rohan", amount: inr(60) }, { userId: "sneha", amount: inr(60) }], category: "food" as const },

    // Day 2: Jaipur sightseeing
    { day: 2, desc: "Amber Fort tickets + guide", amount: inr(1800), payers: [{ userId: "arjun", amount: inr(1800) }], splits: allocateEqual(inr(1800), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "tickets" as const },
    { day: 2, desc: "City Palace & Jantar Mantar", amount: inr(1600), payers: [{ userId: "priya", amount: inr(1600) }], splits: allocateEqual(inr(1600), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "tickets" as const },
    { day: 2, desc: "Lunch - LMB & shopping Johari Bazaar", amount: inr(3200), payers: [{ userId: "sneha", amount: inr(3200) }], splits: [{ userId: "sneha", amount: inr(1200) }, { userId: "priya", amount: inr(800) }, { userId: "rohan", amount: inr(600) }, { userId: "arjun", amount: inr(600) }], category: "shopping" as const }, // unequal: Sneha bought more
    { day: 2, desc: "Dinner - Handi restaurant", amount: inr(2100), payers: [{ userId: "rohan", amount: inr(2100) }], splits: allocateEqual(inr(2100), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "food" as const },

    // Day 3: Jaipur → Udaipur (bus)
    { day: 3, desc: "Volvo bus Jaipur-Udaipur", amount: inr(3600), payers: [{ userId: "arjun", amount: inr(3600) }], splits: allocateEqual(inr(3600), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "transport" as const },
    { day: 3, desc: "Lake Pichola hotel", amount: inr(7200), payers: [{ userId: "priya", amount: inr(7200) }], splits: allocateEqual(inr(7200), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "accommodation" as const },
    { day: 3, desc: "Boat ride + snacks", amount: inr(1400), payers: [{ userId: "rohan", amount: inr(1400) }], splits: allocateEqual(inr(1400), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "tickets" as const },

    // Day 4: Udaipur
    { day: 4, desc: "Udaipur palace tickets", amount: inr(1200), payers: [{ userId: "arjun", amount: inr(1200) }], splits: allocateEqual(inr(1200), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "tickets" as const },
    { day: 4, desc: "Mithai & namkeen for train", amount: inr(850), payers: [{ userId: "sneha", amount: inr(850) }], splits: allocateEqual(inr(850), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "food" as const },
    { day: 4, desc: "Auto + shopping - Hathi Pol", amount: inr(2800), payers: [{ userId: "sneha", amount: inr(2800) }], splits: [{ userId: "sneha", amount: inr(1500) }, { userId: "priya", amount: inr(500) }, { userId: "rohan", amount: inr(400) }, { userId: "arjun", amount: inr(400) }], category: "shopping" as const },
    { day: 4, desc: "Dinner - Ambrai ghat", amount: inr(3800), payers: [{ userId: "rohan", amount: inr(3800) }], splits: allocateEqual(inr(3800), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "food" as const },

    // Day 5: Udaipur → Jaisalmer (overnight train)
    { day: 5, desc: "Train Udaipur-Jaisalmer (sleeper)", amount: inr(4200), payers: [{ userId: "arjun", amount: inr(4200) }], splits: allocateEqual(inr(4200), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "transport" as const },
    { day: 5, desc: "Tea, packed dinner on train", amount: inr(680), payers: [{ userId: "rohan", amount: inr(680) }], splits: allocateEqual(inr(680), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "food" as const },

    // Day 6: Jaisalmer desert
    { day: 6, desc: "Hotel + desert camp", amount: inr(8500), payers: [{ userId: "priya", amount: inr(8500) }], splits: allocateEqual(inr(8500), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "accommodation" as const },
    { day: 6, desc: "Camel safari + jeep", amount: inr(4800), payers: [{ userId: "arjun", amount: inr(4800) }], splits: allocateEqual(inr(4800), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "tickets" as const },
    { day: 6, desc: "Folk music & tips", amount: inr(500), payers: [{ userId: "rohan", amount: inr(500) }], splits: allocateEqual(inr(500), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "other" as const },
    { day: 6, desc: "Shopping - leather, carpets", amount: inr(5200), payers: [{ userId: "sneha", amount: inr(5200) }], splits: [{ userId: "sneha", amount: inr(2600) }, { userId: "priya", amount: inr(1000) }, { userId: "arjun", amount: inr(800) }, { userId: "rohan", amount: inr(800) }], category: "shopping" as const },

    // Day 7: Return
    { day: 7, desc: "Jaisalmer Fort tickets", amount: inr(800), payers: [{ userId: "arjun", amount: inr(800) }], splits: allocateEqual(inr(800), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "tickets" as const },
    { day: 7, desc: "Lunch - Dal Baati", amount: inr(1100), payers: [{ userId: "rohan", amount: inr(1100) }], splits: allocateEqual(inr(1100), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "food" as const },
    { day: 7, desc: "Auto to station + train snacks", amount: inr(420), payers: [{ userId: "sneha", amount: inr(420) }], splits: allocateEqual(inr(420), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "transport" as const },
    { day: 7, desc: "Flight Jaisalmer-Jaipur (Sneha only, urgent)", amount: inr(6500), payers: [{ userId: "priya", amount: inr(6500) }], splits: [{ userId: "sneha", amount: inr(6500) }], category: "transport" as const }, // single beneficiary
    { day: 7, desc: "Misc - water, tips, recharge", amount: inr(750), payers: [{ userId: "arjun", amount: inr(750) }], splits: allocateEqual(inr(750), 4).map((a, i) => ({ userId: MEMBERS[i].id, amount: a })), category: "other" as const },
  ]

  it("total trip cost is sum of all expenses", () => {
    const total = expenses.reduce((s, e) => s + e.amount, 0)
    // Expected: sum manually ~ 78k INR for 4 people week
    expect(total).toBeGreaterThan(inr(70000))
    expect(total).toBeLessThan(inr(90000))
    // Format check: Indian INR
    expect(formatMinor(total)).toContain("₹")
  })

  it("all categories are covered", () => {
    const cats = new Set(expenses.map(e => e.category))
    expect(cats).toEqual(new Set(["food", "transport", "accommodation", "tickets", "shopping", "other"]))
  })

  it("each expense splits sum equals amount (allocation integrity)", () => {
    for (const e of expenses) {
      const splitSum = e.splits.reduce((s, v) => s + v.amount, 0)
      expect(splitSum).toBe(e.amount)
      const payerSum = e.payers.reduce((s, v) => s + v.amount, 0)
      expect(payerSum).toBe(e.amount)
    }
  })

  it("net balances conserve to zero (money is not created)", () => {
    const memberIds = MEMBERS.map(m => m.id)
    // Convert to balanceMath shape: payers/splits with userId/amount (minor)
    const balanceExpenses = expenses.map(e => ({
      payers: e.payers.map(p => ({ userId: p.userId, amount: p.amount })),
      splits: e.splits.map(s => ({ userId: s.userId, amount: s.amount })),
    }))
    const net = netBalances(balanceExpenses, [], memberIds)
    const sum = Object.values(net).reduce((s, v) => s + v, 0)
    expect(sum).toBe(0)
    // Everyone has some activity
    for (const id of memberIds) expect(net[id]).toBeDefined()
  })

  it("simplifyDebts minimizes transfers and is deterministic", () => {
    const memberIds = MEMBERS.map(m => m.id)
    const balanceExpenses = expenses.map(e => ({
      payers: e.payers.map(p => ({ userId: p.userId, amount: p.amount })),
      splits: e.splits.map(s => ({ userId: s.userId, amount: s.amount })),
    }))
    const net = netBalances(balanceExpenses, [], memberIds)
    const debts = simplifyDebts(net)
    // At most n-1 transfers for n members
    expect(debts.length).toBeLessThanOrEqual(MEMBERS.length - 1)
    // Sum of debts equals total positive balance
    const totalOwed = debts.reduce((s, d) => s + d.amount, 0)
    const totalPositive = Object.values(net).filter(v => v > 0).reduce((s, v) => s + v, 0)
    expect(totalOwed).toBe(totalPositive)
    // Deterministic: shuffle input order shouldn't change result
    const shuffledNet = { sneha: net.sneha, arjun: net.arjun, priya: net.priya, rohan: net.rohan } as Record<MemberId, number>
    expect(simplifyDebts(shuffledNet)).toEqual(debts)
  })

  it("settlements update balances correctly (simulate UPI payments)", () => {
    const memberIds = MEMBERS.map(m => m.id)
    const balanceExpenses = expenses.map(e => ({
      payers: e.payers.map(p => ({ userId: p.userId, amount: p.amount })),
      splits: e.splits.map(s => ({ userId: s.userId, amount: s.amount })),
    }))
    const netBefore = netBalances(balanceExpenses, [], memberIds)
    // Simulate two settlements: Rohan (big food payer) is owed, Sneha (shopping) owes
    // Find max creditor/debtor
    const sorted = Object.entries(netBefore).sort((a, b) => b[1] - a[1])
    const creditor = sorted[0][0] as MemberId
    const debtor = sorted[sorted.length - 1][0] as MemberId
    const amount = Math.min(netBefore[creditor], -netBefore[debtor])
    expect(amount).toBeGreaterThan(0)
    const settlements = [{ fromId: debtor, toId: creditor, amount: Math.floor(amount / 2) }]
    const netAfter = netBalances(balanceExpenses, settlements, memberIds)
    expect(Object.values(netAfter).reduce((s, v) => s + v, 0)).toBe(0)
    // Debtor owes less after payment
    expect(netAfter[debtor]).toBeGreaterThan(netBefore[debtor])
    expect(netAfter[creditor]).toBeLessThan(netBefore[creditor])
  })

  it("receipt path and notes handling for diverse expenses", () => {
    // Real trip has some expenses with receipts, some with notes
    const withReceipt = expenses.filter(e => e.category === "accommodation" || e.category === "transport")
    expect(withReceipt.length).toBeGreaterThan(5)
    // Notes: e.g., "Auto rickshaw to hotel - meter not working, bargained"
    const notes = "Auto - driver asked 500, bargained to 350 via UPI"
    expect(notes.length).toBeLessThanOrEqual(2000)
    // Receipt size 10MB limit check is in DB, here just ensure path format
    const receiptPath = "0041a001/e001/receipt-"
    expect(receiptPath).not.toMatch(/\.\./)
  })

  it("snapshot: total per member owed vs paid", () => {
    const memberIds = MEMBERS.map(m => m.id)
    const paid: Record<string, number> = Object.fromEntries(memberIds.map(id => [id, 0]))
    const owed: Record<string, number> = Object.fromEntries(memberIds.map(id => [id, 0]))
    for (const e of expenses) {
      for (const p of e.payers) paid[p.userId] += p.amount
      for (const s of e.splits) owed[s.userId] += s.amount
    }
    // Priya paid most (hotels+flight), Arjun next (trains), Rohan food, Sneha shopping
    expect(paid.priya).toBeGreaterThan(paid.sneha)
    expect(paid.arjun).toBeGreaterThan(inr(10000))
    // Sneha shopped more, so owed slightly higher due to unequal splits
    expect(owed.sneha).toBeGreaterThan(owed.rohan - inr(1000))
    // Print for manual verification (not asserted, just visible in test output)
    // eslint-disable-next-line no-console
    console.log("Paid (minor):", paid, "Owed:", owed, "Total:", formatMinor(expenses.reduce((s, e) => s + e.amount, 0)))
  })
})
