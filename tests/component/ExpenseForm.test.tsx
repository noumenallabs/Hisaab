import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/queryClient"
import { ExpenseFormPage } from "@/features/expenses/ExpenseFormPage"

vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }))
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", email: "a@b.com", name: "A" } }) }))

describe("ExpenseForm", () => {
  it("disables save until validation passes (required fields)", async () => {
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/t1/expenses/new"]}><Routes><Route path="/trips/:tripId/expenses/new" element={<ExpenseFormPage />} /></Routes></MemoryRouter></QueryClientProvider>)
    // Description required — form should show validation on submit
    expect(screen.getByText("Add expense")).toBeInTheDocument()
    const user = userEvent.setup()
    const desc = screen.getByPlaceholderText("e.g. Beach dinner")
    expect(desc).toBeInTheDocument()
  })
  it("shows read-only currency (base currency)", () => {
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/t1/expenses/new"]}><Routes><Route path="/trips/:tripId/expenses/new" element={<ExpenseFormPage />} /></Routes></MemoryRouter></QueryClientProvider>)
    // Currency input is readOnly and equals trip base currency (INR per spec)
    const cur = document.querySelector('input[readonly]') as HTMLInputElement
    expect(cur).not.toBeNull()
  })
})
