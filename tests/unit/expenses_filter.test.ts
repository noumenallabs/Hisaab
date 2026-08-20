import { describe, it, expect } from "vitest"

function filterExpenses(list: any[], query: string, category: string) {
  return list.filter((e) => {
    const q = query.toLowerCase()
    const desc = String(e.description ?? "").toLowerCase()
    const notes = String(e.notes ?? "").toLowerCase()
    const matchesQuery = desc.includes(q) || notes.includes(q)
    const matchesCategory = category === "all" || e.category === category
    return matchesQuery && matchesCategory
  })
}

describe("expenses filter", () => {
  const list = [
    { description: "Beach dinner", notes: "Great", category: "food" },
    { description: "Taxi", notes: "Airport", category: "transport" },
  ]
  it("filters by notes", () => {
    expect(filterExpenses(list, "great", "all")).toHaveLength(1)
  })
  it("filters by category", () => {
    expect(filterExpenses(list, "", "food")).toHaveLength(1)
    expect(filterExpenses(list, "", "all")).toHaveLength(2)
  })
})
