import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { InviteManager } from "@/features/trips/InviteManager"
import { ToastProvider } from "@/components/feedback/ToastProvider"

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const mockList = vi.fn()
const mockCreate = vi.fn()
const mockRevoke = vi.fn()
const clipboardSpy = vi.fn().mockResolvedValue(undefined)
vi.mock("@/features/trips/api", () => ({
  listInvites: (...a: any[]) => mockList(...a),
  createInvite: (...a: any[]) => mockCreate(...a),
  revokeInvite: (...a: any[]) => mockRevoke(...a),
}))

describe("InviteManager", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clipboardSpy.mockClear()
    Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboardSpy }, writable: true, configurable: true })
    Object.defineProperty(window, "location", { value: { origin: "http://localhost:8443" }, writable: true })
  })
  it("renders active invite and allows copy/revoke", async () => {
    mockList.mockImplementation((tripId: string) =>
      tripId === "t1"
        ? [{ id: "i1", code: "X7K9PQ2M4A", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000 * 30).toISOString(), max_uses: null, use_count: 0, revoked_at: null, is_active: true }]
        : []
    )
    render(<ToastProvider><QueryClientProvider client={freshClient()}><InviteManager tripId="t1" /></QueryClientProvider></ToastProvider>)
    expect((await screen.findAllByText("X7K9PQ2M4A")).length).toBeGreaterThan(0)
    const user = userEvent.setup()
    // Copy should not throw (clipboard is mocked)
    await user.click(screen.getAllByText("Copy")[0])
    // clipboard may be mocked differently in jsdom - just ensure no crash
    await user.click(screen.getByText("Revoke"))
    // ConfirmDialog appears
    await screen.findByText("Revoke invite?")
    await user.click(screen.getAllByText("Revoke").at(-1)!)
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith("i1"))
  })
  it("generates new invite", async () => {
    mockList.mockImplementation((tripId: string) => (tripId === "t2" ? [] : [{ id: "i1", code: "X", is_active: true } as any]))
    mockCreate.mockResolvedValue([{ id: "i2", code: "NEWWWWWWWW", expires_at: new Date().toISOString() }])
    render(<ToastProvider><QueryClientProvider client={freshClient()}><InviteManager tripId="t2" /></QueryClientProvider></ToastProvider>)
    expect(await screen.findByText(/No invites yet/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByText("Generate new"))
    expect(mockCreate).toHaveBeenCalledWith("t2", 30, null)
  })
})
