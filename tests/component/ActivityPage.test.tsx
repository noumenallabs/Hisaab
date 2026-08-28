import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ActivityPage } from "@/features/activity/ActivityPage"

const mockGetSupabase = vi.fn()
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => mockGetSupabase(),
}))

const mockUseActivity = vi.fn()
vi.mock("@/features/activity/hooks", () => ({
  useActivity: () => mockUseActivity(),
}))

vi.mock("@/features/trips/hooks", () => ({
  useTrip: () => ({ data: { id: "t_1", name: "Test Trip", base_currency: "INR" } }),
}))

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: () => ({ data: [{ user_id: "u_1", name: "Arun" }] }),
}))

vi.mock("@/features/expenses/hooks", () => ({
  useExpenses: () => ({ data: [] }),
}))

describe("ActivityPage", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/t_1/activity"]}>
          <Routes>
            <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it("renders loading state without hook mismatch when transition to loaded occurs", () => {
    mockGetSupabase.mockReturnValue({ from: vi.fn() })
    mockUseActivity.mockReturnValue({
      isLoading: true,
      data: undefined,
    })

    const { rerender } = renderPage()

    // Transition to loaded state
    mockUseActivity.mockReturnValue({
      isLoading: false,
      data: {
        pages: [
          [
            {
              id: "act_1",
              action: "create",
              entity_type: "expense",
              actor_user_id: "u_1",
              created_at: new Date().toISOString(),
              changed_fields: [],
            },
          ],
        ],
      },
    })

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/t_1/activity"]}>
          <Routes>
            <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByText("Activity log")).toBeDefined()
  })

  it("renders demo mode fallback without error when supabase is null", () => {
    mockGetSupabase.mockReturnValue(null)
    mockUseActivity.mockReturnValue({
      isLoading: false,
      data: undefined,
    })

    renderPage()
    expect(screen.getByText("Activity log is available when connected to Supabase backend.")).toBeDefined()
  })
})
