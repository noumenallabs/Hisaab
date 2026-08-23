import { simplifyDebts } from "./balanceMath"

export type DayTimelineItem = {
  date: string
  dayNumber: number
  label: string
  totalMinor: number
  expenseCount: number
  payerMap: Record<string, number>
  transfers: { fromId: string; toId: string; amount: number }[]
  net: Record<string, number>
  isSettled: boolean
}

export type MemberDayBreakdownItem = {
  date: string
  dayNumber: number
  label: string
  paidMinor: number
  owedMinor: number
  netMinor: number
  totalDayMinor: number
}

function formatDateLabel(dateStr: string, dayNumber: number): string {
  try {
    const d = new Date(dateStr + "T00:00:00")
    const formatted = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    return `Day ${dayNumber} · ${formatted}`
  } catch {
    return `Day ${dayNumber} · ${dateStr}`
  }
}

/**
 * Computes isolated zero-sum net balances and minimal transfers for a specific date (or "all").
 */
export function computeDayDebts(
  expenses: any[],
  date: string | "all"
): {
  transfers: { fromId: string; toId: string; amount: number }[]
  net: Record<string, number>
} {
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)
  const targetExpenses =
    date === "all"
      ? activeExpenses
      : activeExpenses.filter((e) => {
          const d = e.expense_date ?? e.date ?? e.created_at?.slice(0, 10)
          return d === date
        })

  const paidMap = new Map<string, number>()
  const owedMap = new Map<string, number>()
  const allUserIds = new Set<string>()

  for (const exp of targetExpenses) {
    const payers = (exp.expense_payers ?? exp.payers ?? []) as any[]
    for (const p of payers) {
      const uid = String(p.user_id ?? p.userId)
      const amt = Number(p.amount_paid_minor ?? p.amountPaidMinor ?? p.amount ?? 0)
      paidMap.set(uid, (paidMap.get(uid) ?? 0) + amt)
      allUserIds.add(uid)
    }

    const splits = (exp.expense_splits ?? exp.splits ?? []) as any[]
    for (const s of splits) {
      const uid = String(s.user_id ?? s.userId)
      const amt = Number(s.amount_owed_minor ?? s.amountOwedMinor ?? s.amount ?? 0)
      owedMap.set(uid, (owedMap.get(uid) ?? 0) + amt)
      allUserIds.add(uid)
    }
  }

  const net: Record<string, number> = {}
  for (const uid of allUserIds) {
    const p = paidMap.get(uid) ?? 0
    const o = owedMap.get(uid) ?? 0
    net[uid] = p - o
  }

  const transfers = simplifyDebts(net)
  return { transfers, net }
}

/**
 * Computes a chronological timeline of trip days with daily spend, payers, and daily debt settlement plan.
 */
export function computeDayTimeline(
  expenses: any[],
  tripStartDate?: string
): DayTimelineItem[] {
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)
  if (activeExpenses.length === 0) return []

  // Group by date
  const dateMap = new Map<string, any[]>()
  for (const exp of activeExpenses) {
    const d = exp.expense_date ?? exp.date ?? exp.created_at?.slice(0, 10) ?? "Unknown Date"
    if (!dateMap.has(d)) {
      dateMap.set(d, [])
    }
    dateMap.get(d)!.push(exp)
  }

  // Sort dates chronologically
  const sortedDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b))

  return sortedDates.map((dateStr, index) => {
    let dayNumber = index + 1
    if (tripStartDate && /^\d{4}-\d{2}-\d{2}$/.test(tripStartDate) && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const tStart = new Date(tripStartDate + "T00:00:00").getTime()
      const tCur = new Date(dateStr + "T00:00:00").getTime()
      const diffDays = Math.round((tCur - tStart) / (1000 * 60 * 60 * 24))
      if (diffDays >= 0) {
        dayNumber = diffDays + 1
      }
    }

    const dayExpenses = dateMap.get(dateStr)!
    const totalMinor = dayExpenses.reduce(
      (s, e) => s + Number(e.amount_minor ?? e.amount ?? 0),
      0
    )

    const payerMap: Record<string, number> = {}
    for (const exp of dayExpenses) {
      const payers = (exp.expense_payers ?? exp.payers ?? []) as any[]
      for (const p of payers) {
        const uid = String(p.user_id ?? p.userId)
        const amt = Number(p.amount_paid_minor ?? p.amountPaidMinor ?? p.amount ?? 0)
        payerMap[uid] = (payerMap[uid] ?? 0) + amt
      }
    }

    const { transfers, net } = computeDayDebts(dayExpenses, dateStr)
    const isSettled = transfers.length === 0

    return {
      date: dateStr,
      dayNumber,
      label: formatDateLabel(dateStr, dayNumber),
      totalMinor,
      expenseCount: dayExpenses.length,
      payerMap,
      transfers,
      net,
      isSettled,
    }
  })
}

/**
 * Computes member's personal spend, owed share, and net balance for each day of the trip.
 */
export function computeMemberDayBreakdown(
  expenses: any[],
  userId: string,
  tripStartDate?: string
): MemberDayBreakdownItem[] {
  const timeline = computeDayTimeline(expenses, tripStartDate)
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)

  return timeline.map((item) => {
    const dayExpenses = activeExpenses.filter((e) => {
      const d = e.expense_date ?? e.date ?? e.created_at?.slice(0, 10)
      return d === item.date
    })

    let paidMinor = 0
    let owedMinor = 0

    for (const exp of dayExpenses) {
      const payers = (exp.expense_payers ?? exp.payers ?? []) as any[]
      for (const p of payers) {
        const uid = String(p.user_id ?? p.userId)
        if (uid === userId) {
          paidMinor += Number(p.amount_paid_minor ?? p.amountPaidMinor ?? p.amount ?? 0)
        }
      }

      const splits = (exp.expense_splits ?? exp.splits ?? []) as any[]
      for (const s of splits) {
        const uid = String(s.user_id ?? s.userId)
        if (uid === userId) {
          owedMinor += Number(s.amount_owed_minor ?? s.amountOwedMinor ?? s.amount ?? 0)
        }
      }
    }

    return {
      date: item.date,
      dayNumber: item.dayNumber,
      label: item.label,
      paidMinor,
      owedMinor,
      netMinor: paidMinor - owedMinor,
      totalDayMinor: item.totalMinor,
    }
  })
}
