// Production-safe metadata only per §3.5. Demo fixtures live in tests/fixtures/demo.ts (test-only).
// This file retains Category type + categoryMeta (UI display) and shared domain types.
// Do not add demo members/expenses/settlements/audit fixtures here.

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

export type Transfer = { fromId: string; toId: string; amount: number }

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
