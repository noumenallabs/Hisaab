export type Category = "food" | "transport" | "accommodation" | "tickets" | "shopping" | "other"

export type Member = {
  id: string; name: string; avatar: string; role: "owner" | "member"
}

export type Expense = {
  id: string; description: string; amount: number; category: Category
  date: string // ISO
  notes?: string; hasReceipt?: boolean; payers: { userId: string; amount: number }[]
  splits: { userId: string; amount: number }[]
  createdBy: string; deleted?: boolean
}

export type Settlement = {
  id: string; fromId: string; toId: string; amount: number; date: string; method: string; reference?: string; note?: string
}

export type AuditEntry = {
  id: string; actorId: string; action: string; entity: "expense" | "settlement" | "member" | "trip"
  summary: string; changes?: { field: string; from: string; to: string }[]
  at: string // ISO datetime
}

export const CURRENCY = "₹"

export function money(n: number): string {
  const sign = n < 0 ? "-" : ""
  return (
    sign +
    CURRENCY +
    Math.abs(n).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  )
}

export const YOU = "u_arun"

export const members: Member[] = [
  { id: "u_arun", name: "Arun Menon", avatar: "AM", role: "owner" },
  { id: "u_priya", name: "Priya Nair", avatar: "PN", role: "member" },
  { id: "u_dev", name: "Dev Kapoor", avatar: "DK", role: "member" },
  { id: "u_sara", name: "Sara Iyer", avatar: "SI", role: "member" },
]

export const trip = {
  id: "trip_goa",
  name: "Goa Reunion",
  destination: "Goa, India",
  startDate: "2026-08-14",
  endDate: "2026-08-19",
  baseCurrency: "INR",
  status: "active" as "active" | "settled" | "archived",
  inviteCode: "GOA-4RX9",
}

export const categoryMeta: Record<Category, {
  label: string; color: string; bg: string
}> = {
  food: { label: "Food", color: "#ea580c", bg: "#fff1e9" },
  transport: { label: "Transport", color: "#0284c7", bg: "#e6f4fb" },
  accommodation: { label: "Stay", color: "#7c3aed", bg: "#f1ebfe" },
  tickets: { label: "Tickets", color: "#db2777", bg: "#fdecf4" },
  shopping: { label: "Shopping", color: "#a16207", bg: "#fbf3e0" },
  other: { label: "Other", color: "#64748b", bg: "#eef1f4" },
}

export const initialExpenses: Expense[] = [
  {
    id: "e1",
    description: "Beach shack dinner",
    amount: 3200,
    category: "food",
    date: "2026-08-17",
    notes: "Seafood platter + drinks for everyone.",
    hasReceipt: true,
    payers: [{ userId: "u_priya", amount: 3200 }],
    splits: [
      { userId: "u_arun", amount: 800 },
      { userId: "u_priya", amount: 800 },
      { userId: "u_dev", amount: 800 },
      { userId: "u_sara", amount: 800 },
    ],
    createdBy: "u_priya",
  },
  {
    id: "e2",
    description: "Scooter rentals (2 days)",
    amount: 1600,
    category: "transport",
    date: "2026-08-17",
    payers: [{ userId: "u_arun", amount: 1600 }],
    splits: [
      { userId: "u_arun", amount: 400 },
      { userId: "u_priya", amount: 400 },
      { userId: "u_dev", amount: 400 },
      { userId: "u_sara", amount: 400 },
    ],
    createdBy: "u_arun",
  },
  {
    id: "e3",
    description: "Sea-view villa (3 nights)",
    amount: 18000,
    category: "accommodation",
    date: "2026-08-14",
    hasReceipt: true,
    notes: "Booked via host, includes cleaning fee.",
    payers: [{ userId: "u_arun", amount: 18000 }],
    splits: [
      { userId: "u_arun", amount: 4500 },
      { userId: "u_priya", amount: 4500 },
      { userId: "u_dev", amount: 4500 },
      { userId: "u_sara", amount: 4500 },
    ],
    createdBy: "u_arun",
  },
  {
    id: "e4",
    description: "Fort Aguada entry + guide",
    amount: 1200,
    category: "tickets",
    date: "2026-08-16",
    payers: [{ userId: "u_dev", amount: 1200 }],
    splits: [
      { userId: "u_arun", amount: 300 },
      { userId: "u_priya", amount: 300 },
      { userId: "u_dev", amount: 300 },
      { userId: "u_sara", amount: 300 },
    ],
    createdBy: "u_dev",
  },
  {
    id: "e5",
    description: "Cabs to the market",
    amount: 900,
    category: "transport",
    date: "2026-08-16",
    payers: [{ userId: "u_sara", amount: 900 }],
    splits: [
      { userId: "u_arun", amount: 300 },
      { userId: "u_priya", amount: 300 },
      { userId: "u_sara", amount: 300 },
    ],
    createdBy: "u_sara",
  },
  {
    id: "e6",
    description: "Souvenirs & snacks",
    amount: 2400,
    category: "shopping",
    date: "2026-08-15",
    payers: [{ userId: "u_priya", amount: 2400 }],
    splits: [
      { userId: "u_arun", amount: 600 },
      { userId: "u_priya", amount: 600 },
      { userId: "u_dev", amount: 600 },
      { userId: "u_sara", amount: 600 },
    ],
    createdBy: "u_priya",
  },
]

export const initialSettlements: Settlement[] = [
  {
    id: "s1",
    fromId: "u_dev",
    toId: "u_arun",
    amount: 1500,
    date: "2026-08-18",
    method: "UPI",
    reference: "UPI/443021",
    note: "Part payment towards villa.",
  },
]

export const initialAudit: AuditEntry[] = [
  {
    id: "a1",
    actorId: "u_arun",
    action: "created",
    entity: "trip",
    summary: "created the trip Goa Reunion",
    at: "2026-08-12T09:04:00",
  },
  {
    id: "a2",
    actorId: "u_arun",
    action: "added",
    entity: "member",
    summary: "invited Priya, Dev and Sara",
    at: "2026-08-12T09:06:00",
  },
  {
    id: "a3",
    actorId: "u_priya",
    action: "changed",
    entity: "expense",
    summary: "changed Beach shack dinner",
    changes: [{ field: "Amount", from: "₹2,400", to: "₹3,200" }],
    at: "2026-08-17T21:40:00",
  },
  {
    id: "a4",
    actorId: "u_dev",
    action: "recorded",
    entity: "settlement",
    summary: "recorded a ₹1,500 settlement to Arun",
    at: "2026-08-18T08:15:00",
  },
]

// ---- balance math -------------------------------------------------------

export function netBalances(
  expenses: Expense[],
  settlements: Settlement[],
): Record<string, number> {
  const net: Record<string, number> = {}
  for (const m of members) net[m.id] = 0
  for (const e of expenses) {
    if (e.deleted) continue
    for (const p of e.payers) net[p.userId] += p.amount
    for (const s of e.splits) net[s.userId] -= s.amount
  }
  for (const s of settlements) {
    net[s.fromId] += s.amount
    net[s.toId] -= s.amount
  }
  return net
}

export type Transfer = { fromId: string; toId: string; amount: number }

// Greedy min-cash-flow debt simplification.
export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const creditors: { id: string; amt: number }[] = []
  const debtors: { id: string; amt: number }[] = []
  for (const id of Object.keys(net)) {
    const v = Math.round(net[id])
    if (v > 0) creditors.push({ id, amt: v })
    else if (v < 0) debtors.push({ id, amt: -v })
  }
  creditors.sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))
  debtors.sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))
  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt)
    if (pay > 0)
      transfers.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        amount: pay,
      })
    debtors[i].amt -= pay
    creditors[j].amt -= pay
    if (debtors[i].amt === 0) i++
    if (creditors[j].amt === 0) j++
  }
  return transfers
}

export function memberById(id: string): Member {
  return members.find((m) => m.id === id) ?? members[0]
}
