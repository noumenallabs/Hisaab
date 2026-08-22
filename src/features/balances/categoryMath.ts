export type ExpenseCategory =
  | "food"
  | "transport"
  | "accommodation"
  | "tickets"
  | "shopping"
  | "other"

export const CATEGORY_META: Record<
  ExpenseCategory,
  { label: string; emoji: string; color: string }
> = {
  accommodation: { label: "Stay & Lodging", emoji: "🏨", color: "bg-indigo-500" },
  transport: { label: "Transport & Fuel", emoji: "🚕", color: "bg-amber-500" },
  food: { label: "Food & Dining", emoji: "🍕", color: "bg-orange-500" },
  tickets: { label: "Tickets & Activities", emoji: "🎟️", color: "bg-purple-500" },
  shopping: { label: "Shopping", emoji: "🛍️", color: "bg-pink-500" },
  other: { label: "Other / Misc", emoji: "📦", color: "bg-slate-500" },
}

export type CategoryBreakdownItem = {
  category: ExpenseCategory
  label: string
  emoji: string
  color: string
  paidMinor: number
  shareMinor: number
  netMinor: number
  percentageOfBudget: number
}

export type GroupCategorySummaryItem = {
  category: ExpenseCategory
  label: string
  emoji: string
  color: string
  totalMinor: number
  percentage: number
  expenseCount: number
}

export function computeCategoryBreakdown(
  expenses: any[],
  userId: string
): CategoryBreakdownItem[] {
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)
  const categories: ExpenseCategory[] = [
    "accommodation",
    "food",
    "transport",
    "tickets",
    "shopping",
    "other",
  ]

  // Map sums
  const paidMap = new Map<ExpenseCategory, number>()
  const shareMap = new Map<ExpenseCategory, number>()
  let totalUserShare = 0

  for (const cat of categories) {
    paidMap.set(cat, 0)
    shareMap.set(cat, 0)
  }

  for (const exp of activeExpenses) {
    const cat = (exp.category ?? "other") as ExpenseCategory
    const validCat = categories.includes(cat) ? cat : "other"

    // Payers
    const payers = exp.expense_payers ?? exp.payers ?? []
    for (const p of payers) {
      const pid = p.user_id ?? p.userId
      if (pid === userId) {
        const amt = Number(p.amount_paid_minor ?? p.amountPaidMinor ?? p.amount ?? 0)
        paidMap.set(validCat, (paidMap.get(validCat) ?? 0) + amt)
      }
    }

    // Splits
    const splits = exp.expense_splits ?? exp.splits ?? []
    for (const s of splits) {
      const sid = s.user_id ?? s.userId
      if (sid === userId) {
        const amt = Number(s.amount_owed_minor ?? s.amountOwedMinor ?? s.amount ?? 0)
        shareMap.set(validCat, (shareMap.get(validCat) ?? 0) + amt)
        totalUserShare += amt
      }
    }
  }

  return categories.map((cat) => {
    const meta = CATEGORY_META[cat]
    const paidMinor = paidMap.get(cat) ?? 0
    const shareMinor = shareMap.get(cat) ?? 0
    const netMinor = paidMinor - shareMinor
    const percentageOfBudget =
      totalUserShare > 0 ? Math.round((shareMinor / totalUserShare) * 100) : 0

    return {
      category: cat,
      label: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      paidMinor,
      shareMinor,
      netMinor,
      percentageOfBudget,
    }
  })
}

export function computeGroupCategorySummary(expenses: any[]): {
  totalTripMinor: number
  categories: GroupCategorySummaryItem[]
} {
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)
  const categories: ExpenseCategory[] = [
    "accommodation",
    "food",
    "transport",
    "tickets",
    "shopping",
    "other",
  ]

  const totalMap = new Map<ExpenseCategory, number>()
  const countMap = new Map<ExpenseCategory, number>()
  let totalTripMinor = 0

  for (const cat of categories) {
    totalMap.set(cat, 0)
    countMap.set(cat, 0)
  }

  for (const exp of activeExpenses) {
    const cat = (exp.category ?? "other") as ExpenseCategory
    const validCat = categories.includes(cat) ? cat : "other"
    const amt = Number(exp.amount_minor ?? exp.amount ?? 0)
    totalMap.set(validCat, (totalMap.get(validCat) ?? 0) + amt)
    countMap.set(validCat, (countMap.get(validCat) ?? 0) + 1)
    totalTripMinor += amt
  }

  const items = categories.map((cat) => {
    const meta = CATEGORY_META[cat]
    const totalMinor = totalMap.get(cat) ?? 0
    const expenseCount = countMap.get(cat) ?? 0
    const percentage =
      totalTripMinor > 0 ? (totalMinor / totalTripMinor) * 100 : 0

    return {
      category: cat,
      label: meta.label,
      emoji: meta.emoji,
      color: meta.color,
      totalMinor,
      percentage,
      expenseCount,
    }
  })

  return { totalTripMinor, categories: items }
}

export type PairwiseLedgerItem = {
  expenseId: string
  description: string
  category: string
  expenseDate: string
  totalMinor: number
  amountPaidByA: number
  amountPaidByB: number
  amountOwedByA: number
  amountOwedByB: number
  amountOwedByBToA: number // net liability in this expense from B to A
  amountOwedByAToB: number // net liability in this expense from A to B
}

export function computePairwiseLedger(
  expenses: any[],
  userAId: string,
  userBId: string
): {
  items: PairwiseLedgerItem[]
  totalPaidByAForB: number
  totalPaidByBForA: number
  netPairwiseMinor: number // > 0 means B owes A; < 0 means A owes B
} {
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)
  const items: PairwiseLedgerItem[] = []
  let totalPaidByAForB = 0
  let totalPaidByBForA = 0

  for (const exp of activeExpenses) {
    const payers = (exp.expense_payers ?? exp.payers ?? []) as any[]
    const splits = (exp.expense_splits ?? exp.splits ?? []) as any[]
    const totalExpAmt = Number(exp.amount_minor ?? exp.amount ?? 0)
    if (totalExpAmt <= 0) continue

    const payerA = payers.find((p) => (p.user_id ?? p.userId) === userAId)
    const payerB = payers.find((p) => (p.user_id ?? p.userId) === userBId)
    const splitA = splits.find((s) => (s.user_id ?? s.userId) === userAId)
    const splitB = splits.find((s) => (s.user_id ?? s.userId) === userBId)

    const paidA = Number(payerA?.amount_paid_minor ?? payerA?.amountPaidMinor ?? payerA?.amount ?? 0)
    const paidB = Number(payerB?.amount_paid_minor ?? payerB?.amountPaidMinor ?? payerB?.amount ?? 0)
    const owedA = Number(splitA?.amount_owed_minor ?? splitA?.amountOwedMinor ?? splitA?.amount ?? 0)
    const owedB = Number(splitB?.amount_owed_minor ?? splitB?.amountOwedMinor ?? splitB?.amount ?? 0)

    // Check if both or either are involved
    if ((paidA > 0 && owedB > 0) || (paidB > 0 && owedA > 0)) {
      // Portion of B's share funded by A's payment: (paidA / totalExpAmt) * owedB
      const owedByBToA = Math.round((paidA / totalExpAmt) * owedB)
      // Portion of A's share funded by B's payment: (paidB / totalExpAmt) * owedA
      const owedByAToB = Math.round((paidB / totalExpAmt) * owedA)

      totalPaidByAForB += owedByBToA
      totalPaidByBForA += owedByAToB

      items.push({
        expenseId: exp.id,
        description: exp.description ?? "Expense",
        category: exp.category ?? "other",
        expenseDate: exp.expense_date ?? exp.date ?? "",
        totalMinor: totalExpAmt,
        amountPaidByA: paidA,
        amountPaidByB: paidB,
        amountOwedByA: owedA,
        amountOwedByB: owedB,
        amountOwedByBToA: owedByBToA,
        amountOwedByAToB: owedByAToB,
      })
    }
  }

  const netPairwiseMinor = totalPaidByAForB - totalPaidByBForA

  return {
    items,
    totalPaidByAForB,
    totalPaidByBForA,
    netPairwiseMinor,
  }
}
