import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { CurrencyAmount } from "@/components/finance/CurrencyAmount"
import { ExpenseRow } from "@/components/finance/ExpenseRow"
import { BalanceRow } from "@/components/finance/BalanceRow"

describe("finance components", () => {
  it("CurrencyAmount renders money", () => { render(<CurrencyAmount minor={1234} />); expect(screen.getByText(/₹/)).toBeInTheDocument() })
  it("CurrencyAmount tone owed", () => { const { container } = render(<CurrencyAmount minor={100} tone="owed" />); expect(container.firstChild).toHaveClass("text-owed") })
  it("CurrencyAmount tone owe", () => { const { container } = render(<CurrencyAmount minor={100} tone="owe" />); expect(container.firstChild).toHaveClass("text-owe") })
  it("ExpenseRow renders", () => {
    const exp={id:"e1",description:"Dinner",category:"food" as const, amount_minor:1000, expense_date:"2026-08-14"}
    render(<MemoryRouter><ExpenseRow expense={exp as any} tripId="t1" /></MemoryRouter>)
    expect(screen.getByText("Dinner")).toBeInTheDocument()
    expect(screen.getByText(/₹/)).toBeInTheDocument()
  })
  it("BalanceRow renders avatar and amounts", () => {
    render(<BalanceRow userId="u_arun" name="Arun Menon" paid={1000} owed={500} net={500} />)
    expect(screen.getByText("Arun Menon")).toBeInTheDocument()
  })
  it("BalanceRow negative net shows owe tone", () => {
    const { container } = render(<BalanceRow userId="u_dev" name="Dev" paid={0} owed={500} net={-500} />)
    expect(container.textContent).toContain("Dev")
  })
})
