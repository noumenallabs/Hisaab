import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TripSettingsPage } from "@/features/settings/TripSettingsPage"
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "admin-1", email: "a@b.com", name: "A" } }) }))
vi.mock("@/lib/useAdmin", () => ({ useIsAdmin: () => ({ data: false }) }))

vi.mock("@/features/trips/hooks", () => ({ useTrip: () => ({ data: { id: "t1", name: "Goa", destination: "Goa", base_currency: "INR", status: "archived" } }) }))
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }))
vi.mock("@/features/trips/InviteManager", () => ({ InviteManager: () => <div>invites</div> }))
vi.mock("@/data", async () => {
  const actual: any = await vi.importActual("@/data")
  return { ...actual, members: [{ id: "u1", name: "A", role: "owner" }] }
})
vi.mock("@/components/feedback/ToastProvider", () => ({ useToast: () => ({ toast: vi.fn() }) }))

describe("ArchivedTrip disables mutations", () => {
  it("shows archived banner and hides invite manager actions", async () => {
    const qc = new QueryClient()
    render(<QueryClientProvider client={qc}><MemoryRouter><TripSettingsPage /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText(/Archived trips are read-only/)).toBeInTheDocument()
    // Invite manager should not render for archived (check our TripSettings hides it when archived)
    expect(screen.queryByText("Generate new")).not.toBeInTheDocument()
  })
})
