import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"
import { ActivityPage } from "@/features/activity/ActivityPage"

// Mock Supabase
let mockSupabase: any = {}
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => mockSupabase,
}))

// Mock Auth
let mockUser: { id: string; name: string; email: string } | null = {
  id: "u_owner",
  name: "Owner User",
  email: "owner@example.com",
}
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser }),
}))

// Mock Trip Data
let mockTripData: any = {
  id: "t_test",
  name: "Alpine Expedition",
  base_currency: "USD",
  status: "active",
}
vi.mock("@/features/trips/hooks", () => ({
  useTrip: vi.fn(() => ({ data: mockTripData, isLoading: false })),
}))

// Mock Trip Members
let mockMembersData: any[] = [
  { id: "u_owner", user_id: "u_owner", name: "Alice Owner", role: "owner" },
  { id: "u_member1", user_id: "u_member1", name: "Bob Member", role: "member" },
]
vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: vi.fn(() => ({ data: mockMembersData, isLoading: false })),
}))

// Mock Expenses
let mockExpensesData: any[] = []
let mockExpensesLoading = false
vi.mock("@/features/expenses/hooks", () => ({
  useExpenses: vi.fn(() => ({ data: mockExpensesData, isLoading: mockExpensesLoading })),
  useExpense: vi.fn(() => ({ data: null, isLoading: false })),
}))

// Mock Activity
let mockActivityData: { pages: any[][] } = { pages: [[]] }
let mockActivityLoading = false
let mockHasNextPage = false
let mockIsFetchingNextPage = false
const mockFetchNextPage = vi.fn()

vi.mock("@/features/activity/hooks", () => ({
  useActivity: vi.fn(() => ({
    data: mockActivityData,
    isLoading: mockActivityLoading,
    hasNextPage: mockHasNextPage,
    isFetchingNextPage: mockIsFetchingNextPage,
    fetchNextPage: mockFetchNextPage,
  })),
}))

function renderWithProviders(ui: React.ReactElement, initialPath = "/trips/t_test/expenses") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
          <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("Screen Empty States & Micro-interactions — Empirical Adversarial Testing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = {}
    mockUser = { id: "u_owner", name: "Owner User", email: "owner@example.com" }
    mockTripData = { id: "t_test", name: "Alpine Expedition", base_currency: "USD", status: "active" }
    mockMembersData = [
      { id: "u_owner", user_id: "u_owner", name: "Alice Owner", role: "owner" },
      { id: "u_member1", user_id: "u_member1", name: "Bob Member", role: "member" },
    ]
    mockExpensesData = []
    mockExpensesLoading = false
    mockActivityData = { pages: [[]] }
    mockActivityLoading = false
    mockHasNextPage = false
    mockIsFetchingNextPage = false
  })

  describe("ExpensesPage Empty States & Edge Conditions", () => {
    it("renders zero expenses empty state with primary CTA when trip is active", () => {
      mockExpensesData = []
      renderWithProviders(<ExpensesPage />)

      expect(screen.getByText("No expenses recorded yet")).toBeInTheDocument()
      expect(screen.getByText("Add your first expense to calculate splits and group balances automatically.")).toBeInTheDocument()
      const addFirstBtn = screen.getByRole("link", { name: /Add first expense/i })
      expect(addFirstBtn).toBeInTheDocument()
      expect(addFirstBtn).toHaveAttribute("href", "/trips/t_test/expenses/new")
      expect(screen.queryByRole("button", { name: /Export CSV/i })).not.toBeInTheDocument()
    })

    it("hides 'Add first expense' CTA when trip is archived and displays status message", () => {
      mockExpensesData = []
      mockTripData.status = "archived"
      renderWithProviders(<ExpensesPage />)

      expect(screen.getByText("No expenses recorded yet")).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: /Add first expense/i })).not.toBeInTheDocument()
      expect(screen.getByText("Archived — read-only")).toBeInTheDocument()
    })

    it("hides 'Add first expense' CTA when trip is settled and displays status message", () => {
      mockExpensesData = []
      mockTripData.status = "settled"
      renderWithProviders(<ExpensesPage />)

      expect(screen.getByText("No expenses recorded yet")).toBeInTheDocument()
      expect(screen.queryByRole("link", { name: /Add first expense/i })).not.toBeInTheDocument()
      expect(screen.getByText("Settled — no new expenses")).toBeInTheDocument()
    })

    it("renders filter empty state with search emoji and 'Clear all filters' button on zero search matches", async () => {
      const user = userEvent.setup()
      mockExpensesData = [
        {
          id: "exp_1",
          description: "Swiss Fondue Dinner",
          amount_minor: 8500,
          category: "food",
          expense_date: "2026-08-20",
          expense_payers: [{ user_id: "u_owner", amount_paid_minor: 8500 }],
          expense_splits: [{ user_id: "u_owner", amount_owed_minor: 8500 }],
        },
      ]

      renderWithProviders(<ExpensesPage />)
      expect(screen.getByText("Swiss Fondue Dinner")).toBeInTheDocument()

      // Type a query that yields zero matches
      const searchInput = screen.getByPlaceholderText(/Search description/i)
      await user.type(searchInput, "Nonexistent Search Term")

      expect(screen.getByText("No matching expenses")).toBeInTheDocument()
      expect(screen.getByText("No expenses matched your filter criteria.")).toBeInTheDocument()
      expect(screen.queryByText("Swiss Fondue Dinner")).not.toBeInTheDocument()

      // Click "Clear all filters" button inside empty state card
      const clearBtn = screen.getByRole("button", { name: /Clear all filters/i })
      await user.click(clearBtn)

      // Expenses should reappear
      expect(screen.getByText("Swiss Fondue Dinner")).toBeInTheDocument()
      expect(screen.queryByText("No matching expenses")).not.toBeInTheDocument()
    })

    it("renders filter empty state on zero category matches and allows reset via toolbar", async () => {
      const user = userEvent.setup()
      mockExpensesData = [
        {
          id: "exp_1",
          description: "Ski Pass",
          amount_minor: 12000,
          category: "tickets",
          expense_date: "2026-08-20",
          expense_payers: [{ user_id: "u_owner", amount_paid_minor: 12000 }],
          expense_splits: [{ user_id: "u_owner", amount_owed_minor: 12000 }],
        },
      ]

      renderWithProviders(<ExpensesPage />)
      expect(screen.getByText("Ski Pass")).toBeInTheDocument()

      // Select a category with no expenses
      const categorySelect = screen.getByLabelText(/Category:/i)
      await user.selectOptions(categorySelect, "accommodation")

      expect(screen.getByText("No matching expenses")).toBeInTheDocument()
      expect(screen.queryByText("Ski Pass")).not.toBeInTheDocument()

      // Reset via toolbar "Reset filters" button
      const resetBtn = screen.getByRole("button", { name: /Reset filters/i })
      await user.click(resetBtn)

      expect(screen.getByText("Ski Pass")).toBeInTheDocument()
    })

    it("handles owner-only 'Show deleted' checkbox toggle", async () => {
      const user = userEvent.setup()
      mockExpensesData = [
        {
          id: "exp_active",
          description: "Active Train Ticket",
          amount_minor: 4000,
          category: "transport",
          expense_date: "2026-08-20",
          expense_payers: [{ user_id: "u_owner", amount_paid_minor: 4000 }],
          expense_splits: [{ user_id: "u_owner", amount_owed_minor: 4000 }],
        },
        {
          id: "exp_deleted",
          description: "Cancelled Hotel",
          amount_minor: 25000,
          category: "accommodation",
          deleted_at: "2026-08-21T10:00:00Z",
          expense_date: "2026-08-21",
          expense_payers: [{ user_id: "u_owner", amount_paid_minor: 25000 }],
          expense_splits: [{ user_id: "u_owner", amount_owed_minor: 25000 }],
        },
      ]

      const { unmount } = renderWithProviders(<ExpensesPage />)

      // As owner, "Show deleted" checkbox is visible; by default deleted is hidden
      expect(screen.getByText("Active Train Ticket")).toBeInTheDocument()
      expect(screen.queryByText("Cancelled Hotel")).not.toBeInTheDocument()

      const showDeletedCheckbox = screen.getByLabelText(/Show deleted/i)
      await user.click(showDeletedCheckbox)

      // Deleted expense should now be visible with badge
      expect(screen.getByText("Cancelled Hotel")).toBeInTheDocument()
      expect(screen.getByText("Deleted")).toBeInTheDocument()
      unmount()

      // When logged in as non-owner member, "Show deleted" checkbox must NOT render
      mockUser = { id: "u_member1", name: "Bob Member", email: "bob@example.com" }
      renderWithProviders(<ExpensesPage />)
      expect(screen.queryByLabelText(/Show deleted/i)).not.toBeInTheDocument()
    })

    it("paginates properly when expense count exceeds visible threshold (100 items)", async () => {
      const user = userEvent.setup()
      const totalCount = 130
      mockExpensesData = Array.from({ length: totalCount }, (_, i) => ({
        id: `exp_${i}`,
        description: `Expense Item ${i}`,
        amount_minor: (i + 1) * 100,
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_owner", amount_paid_minor: (i + 1) * 100 }],
        expense_splits: [{ user_id: "u_owner", amount_owed_minor: (i + 1) * 100 }],
      }))

      renderWithProviders(<ExpensesPage />)

      expect(screen.getByText("Showing 100 of 130 transactions")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Load more \(30 remaining\)/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Show all \(130\)/i })).toBeInTheDocument()

      // Click load more
      await user.click(screen.getByRole("button", { name: /Load more \(30 remaining\)/i }))
      expect(screen.getByText("Showing 130 of 130 transactions")).toBeInTheDocument()
    })

    it("handles malformed expense items safely (null description, missing payers/splits, 0 amount)", () => {
      mockExpensesData = [
        {
          id: "exp_malformed",
          description: null,
          amount_minor: 0,
          category: "unknown_custom",
          expense_date: null,
          expense_payers: null,
          expense_splits: null,
        },
      ]

      const { container } = renderWithProviders(<ExpensesPage />)
      expect(screen.getByText("No date")).toBeInTheDocument()
      expect(screen.getByText("$0.00")).toBeInTheDocument()
      expect(screen.getByText(/Split among 0 people/)).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)
    })

    it("displays error alert when Supabase is not configured", () => {
      mockSupabase = null
      renderWithProviders(<ExpensesPage />)
      expect(screen.getByRole("alert")).toHaveTextContent("Supabase not configured — check env.")
    })
  })

  describe("ActivityPage Empty States & Tab Filtering Edge Conditions", () => {
    it("renders empty state when there are zero activity entries", () => {
      mockActivityData = { pages: [[]] }
      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")

      expect(screen.getByText("No activity recorded yet")).toBeInTheDocument()
      expect(screen.getByText("All trip expenses, settlements, and member edits will appear here in chronological order.")).toBeInTheDocument()
    })

    it("renders specific empty states when filter tabs have no matching actions", async () => {
      const user = userEvent.setup()
      // Only expense creation activity exists
      mockActivityData = {
        pages: [
          [
            {
              id: "act_1",
              action: "create",
              actor_user_id: "u_owner",
              entity_type: "expense",
              entity_id: "exp_1",
              created_at: "2026-08-20T12:00:00Z",
              details: { description: "Lunch", amount_minor: 3000 },
            },
          ],
        ],
      }

      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")

      // Under "all" tab, item is visible
      expect(screen.getByText(/Alice Owner/)).toBeInTheDocument()
      expect(screen.getByText(/^create$/i)).toBeInTheDocument()

      // Switch to "settlements" tab
      await user.click(screen.getByRole("button", { name: /settlements/i }))
      expect(screen.getByText("No settlements activity recorded yet")).toBeInTheDocument()

      // Switch to "members" tab
      await user.click(screen.getByRole("button", { name: /members/i }))
      expect(screen.getByText("No members activity recorded yet")).toBeInTheDocument()

      // Switch back to "expenses" tab
      await user.click(screen.getByRole("button", { name: /expenses/i }))
      expect(screen.getByText(/^create$/i)).toBeInTheDocument()
    })

    it("renders UserAvatar with deterministic fallback when actor is unknown", () => {
      mockActivityData = {
        pages: [
          [
            {
              id: "act_unknown",
              action: "join",
              actor_user_id: "u_unknown_ghost",
              entity_type: "member",
              entity_id: "u_unknown_ghost",
              created_at: "2026-08-20T14:00:00Z",
            },
          ],
        ],
      }

      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")

      expect(screen.getByText(/^join$/i)).toBeInTheDocument()
      // UserAvatar should render fallback for "Member" (initial "M")
      expect(screen.getByText("M")).toBeInTheDocument()
    })

    it("renders modified fields chip when changed_fields is populated", () => {
      mockActivityData = {
        pages: [
          [
            {
              id: "act_update",
              action: "update",
              actor_user_id: "u_owner",
              entity_type: "expense",
              entity_id: "exp_1",
              created_at: "2026-08-20T15:00:00Z",
              changed_fields: ["amount", "description", "category"],
              details: { description: "Dinner", amount_minor: 5000 },
            },
          ],
        ],
      }

      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")

      expect(screen.getByText(/^update$/i)).toBeInTheDocument()
      expect(screen.getByText("Modified fields:")).toBeInTheDocument()
      expect(screen.getByText(/amount, description, category/)).toBeInTheDocument()
    })

    it("renders action color styles correctly for soft_delete, settle, and role_change", () => {
      mockActivityData = {
        pages: [
          [
            {
              id: "act_del",
              action: "soft_delete",
              actor_user_id: "u_owner",
              entity_type: "expense",
              entity_id: "exp_1",
              created_at: "2026-08-20T16:00:00Z",
            },
            {
              id: "act_settle",
              action: "settle",
              actor_user_id: "u_owner",
              entity_type: "settlement",
              entity_id: "set_1",
              created_at: "2026-08-20T17:00:00Z",
            },
            {
              id: "act_role",
              action: "role_change",
              actor_user_id: "u_owner",
              entity_type: "member",
              entity_id: "u_member1",
              created_at: "2026-08-20T18:00:00Z",
            },
          ],
        ],
      }

      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")

      expect(screen.getByText(/^soft delete$/i)).toHaveClass("text-red-800")
      expect(screen.getByText(/^settle$/i)).toHaveClass("text-emerald-800")
      expect(screen.getByText(/^role change$/i)).toHaveClass("text-amber-800")
    })

    it("supports pagination trigger when hasNextPage is true", async () => {
      const user = userEvent.setup()
      mockHasNextPage = true
      mockActivityData = {
        pages: [
          [
            {
              id: "act_1",
              action: "create",
              actor_user_id: "u_owner",
              entity_type: "expense",
              entity_id: "exp_1",
              created_at: "2026-08-20T12:00:00Z",
            },
          ],
        ],
      }

      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")

      const loadMoreBtn = screen.getByRole("button", { name: /Load more activity/i })
      expect(loadMoreBtn).toBeInTheDocument()
      await user.click(loadMoreBtn)
      expect(mockFetchNextPage).toHaveBeenCalledTimes(1)
    })

    it("displays offline notice when Supabase is disconnected", () => {
      mockSupabase = null
      renderWithProviders(<ActivityPage />, "/trips/t_test/activity")
      expect(screen.getByText("Activity log is available when connected to Supabase backend.")).toBeInTheDocument()
    })
  })
})
