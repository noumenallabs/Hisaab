import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router"
import { OfflineBanner } from "@/components/feedback/OfflineBanner"
import {
  FormSkeleton,
  BalancesSkeleton,
  ExpenseListSkeleton,
  FullPageSkeleton,
} from "@/components/feedback/Skeleton"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"

// Mocks for ExpensesPage transition tests
const mockTrip = {
  id: "t_test",
  name: "Async Trip",
  base_currency: "INR",
  status: "active",
}

const mockMembers = [
  { user_id: "u1", name: "Alice", email: "alice@test.com", role: "owner" },
]

let isQueryLoading = true
let queryData: any = []

vi.mock("@/features/trips/hooks", () => ({
  useTrip: () => ({ data: mockTrip, isLoading: false }),
}))

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: () => ({ data: mockMembers, isLoading: false }),
}))

vi.mock("@/features/expenses/hooks", () => ({
  useExpenses: () => ({
    data: isQueryLoading ? undefined : queryData,
    isLoading: isQueryLoading,
  }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Alice" },
    setCustomUser: vi.fn(),
  }),
}))

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ rpc: vi.fn() }),
}))

describe("Async Transitions, Skeletons, and Offline Resilience", () => {
  beforeEach(() => {
    isQueryLoading = true
    queryData = []
    vi.restoreAllMocks()
  })

  // 1. Skeletons accessibility & rendering
  it("renders FormSkeleton with accessible status role", () => {
    render(<FormSkeleton />)
    expect(screen.getByRole("status", { name: /Loading form/i })).toBeInTheDocument()
  })

  it("renders BalancesSkeleton with accessible status role", () => {
    render(<BalancesSkeleton />)
    expect(screen.getByRole("status", { name: /Loading balances/i })).toBeInTheDocument()
  })

  it("renders ExpenseListSkeleton with accessible status role", () => {
    render(<ExpenseListSkeleton />)
    expect(screen.getByRole("status", { name: /Loading expenses/i })).toBeInTheDocument()
  })

  it("renders FullPageSkeleton properly", () => {
    const { container } = render(<FullPageSkeleton />)
    expect(container.querySelector("main")).toBeInTheDocument()
  })

  // 2. Offline banner reactivity
  it("renders offline banner when offline and hides it when online", async () => {
    // Render initially in online state
    render(<OfflineBanner />)
    expect(screen.queryByRole("status", { name: /Offline — writes paused/i })).not.toBeInTheDocument()

    // Trigger offline event with navigator.onLine = false
    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
      window.dispatchEvent(new Event("offline"))
    })

    // Banner should appear
    expect(await screen.findByText(/You’re offline — writes are paused/i)).toBeInTheDocument()

    // Trigger online event with navigator.onLine = true
    act(() => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
      window.dispatchEvent(new Event("online"))
    })

    // Banner should disappear
    await waitFor(() => {
      expect(screen.queryByText(/You’re offline — writes are paused/i)).not.toBeInTheDocument()
    })
  })

  // 3. Simulated Network Latency & Loading-to-Loaded transition
  it("ExpensesPage: transitions cleanly from loading skeleton to loaded data state", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    isQueryLoading = true
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/trips/t_test/expenses"]}>
          <ExpensesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Initially loading -> skeleton rendered
    expect(screen.queryByText("Dinner at Cafe")).not.toBeInTheDocument()

    // Simulate network resolution with loaded expenses
    isQueryLoading = false
    queryData = [
      {
        id: "e1",
        description: "Dinner at Cafe",
        amount_minor: 4500,
        category: "food",
        expense_date: "2026-08-28",
        expense_payers: [{ user_id: "u1", amount_paid_minor: 4500 }],
        expense_splits: [{ user_id: "u1", amount_owed_minor: 4500 }],
      },
    ]

    rerender(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/trips/t_test/expenses"]}>
          <ExpensesPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Data should now be visible without errors
    expect(await screen.findByText("Dinner at Cafe")).toBeInTheDocument()
    expect(screen.getByText("₹45.00")).toBeInTheDocument()
  })
})
