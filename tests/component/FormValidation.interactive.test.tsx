import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { CreateTripPage } from "@/features/trips/CreateTripPage"
import { SignUpPage } from "@/features/auth/SignUpPage"
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage"
import { ProfilePage } from "@/features/profile/ProfilePage"

// Supabase and Auth mocks
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: vi.fn().mockResolvedValue({ data: { id: "test-trip" }, error: null }),
    auth: {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
  isSupabaseConfigured: true,
}))

const mockAuthUser = { id: "u_test", name: "Original Name", email: "test@example.com" }
const mockSetCustomUser = vi.fn()
const mockSignUp = vi.fn().mockResolvedValue({})

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockAuthUser,
    setCustomUser: mockSetCustomUser,
    signUp: mockSignUp,
    signInWithGoogle: vi.fn(),
  }),
}))

describe("Cross-Field Form Validation & Message Dismissal", () => {
  // 1. CreateTripPage Cross-Field Dates and Fields
  it("CreateTripPage: startDate change reactively clears endDate validation error", async () => {
    const user = userEvent.setup()
    const qc = new QueryClient()

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CreateTripPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const startInput = screen.getByLabelText(/START DATE/i) as HTMLInputElement
    const endInput = screen.getByLabelText(/END DATE/i) as HTMLInputElement

    // Set start date AFTER end date
    await user.clear(endInput)
    await user.type(endInput, "2026-08-10")
    await user.clear(startInput)
    await user.type(startInput, "2026-08-20")

    // The validation error should appear
    expect(await screen.findByText(/End date must be on or after start/i)).toBeInTheDocument()

    // Now change start date to before end date
    await user.clear(startInput)
    await user.type(startInput, "2026-08-05")

    // The error should reactively disappear
    await waitFor(() => {
      expect(screen.queryByText(/End date must be on or after start/i)).not.toBeInTheDocument()
    })
  })

  it("CreateTripPage: endDate change reactively clears start/end date validation error", async () => {
    const user = userEvent.setup()
    const qc = new QueryClient()

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CreateTripPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const startInput = screen.getByLabelText(/START DATE/i) as HTMLInputElement
    const endInput = screen.getByLabelText(/END DATE/i) as HTMLInputElement

    // Set start date to 2026-09-10 and end date to 2026-09-01 (invalid)
    await user.clear(startInput)
    await user.type(startInput, "2026-09-10")
    await user.clear(endInput)
    await user.type(endInput, "2026-09-01")

    expect(await screen.findByText(/End date must be on or after start/i)).toBeInTheDocument()

    // Correct end date to 2026-09-15
    await user.clear(endInput)
    await user.type(endInput, "2026-09-15")

    await waitFor(() => {
      expect(screen.queryByText(/End date must be on or after start/i)).not.toBeInTheDocument()
    })
  })

  it("CreateTripPage: trip name input reactively clears name validation error", async () => {
    const user = userEvent.setup()
    const qc = new QueryClient()

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <CreateTripPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const nameInput = screen.getByLabelText(/TRIP NAME/i)
    const destInput = screen.getByLabelText(/DESTINATION/i)

    // Pre-fill destination so only name is invalid
    await user.type(destInput, "Tokyo, Japan")

    const submitBtn = screen.getByRole("button", { name: /Create trip/i })
    await user.click(submitBtn)

    // Name required / min length error appears
    expect(await screen.findByText(/String must contain at least 1 character\(s\)/i)).toBeInTheDocument()

    // Type a valid trip name
    await user.type(nameInput, "Goa Roadtrip")

    // Error should reactively disappear
    await waitFor(() => {
      expect(screen.queryByText(/String must contain at least 1 character\(s\)/i)).not.toBeInTheDocument()
    })
  })

  // 2. SignUpPage Cross-Field Password & Fields
  it("SignUpPage: password edit reactively clears 'Passwords must match' error", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    )

    const nameInput = screen.getByLabelText(/Your Name/i)
    const emailInput = screen.getByLabelText(/Email Address/i)
    const passwordInput = screen.getByLabelText(/^Password/i)
    const confirmInput = screen.getByLabelText(/Confirm Password/i)

    await user.type(nameInput, "Alex")
    await user.type(emailInput, "alex@example.com")
    await user.type(passwordInput, "password123")
    await user.type(confirmInput, "password999")

    // Error for mismatched passwords should appear
    expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()

    // Correct the password to match confirm
    await user.clear(passwordInput)
    await user.type(passwordInput, "password999")

    // Error should reactively clear
    await waitFor(() => {
      expect(screen.queryByText(/Passwords must match/i)).not.toBeInTheDocument()
    })
  })

  it("SignUpPage: confirm password edit reactively clears 'Passwords must match' error", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText(/^Password/i)
    const confirmInput = screen.getByLabelText(/Confirm Password/i)

    await user.type(passwordInput, "supersecret")
    await user.type(confirmInput, "wrongsecret")

    expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()

    // Correct confirm password
    await user.clear(confirmInput)
    await user.type(confirmInput, "supersecret")

    await waitFor(() => {
      expect(screen.queryByText(/Passwords must match/i)).not.toBeInTheDocument()
    })
  })

  it("SignUpPage: typing valid email reactively clears email validation error", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    )

    const emailInput = screen.getByLabelText(/Email Address/i)
    await user.type(emailInput, "invalid-email")

    const submitBtn = screen.getByRole("button", { name: /Create account/i })
    await user.click(submitBtn)

    expect(await screen.findByText(/Please enter a valid email/i)).toBeInTheDocument()

    await user.clear(emailInput)
    await user.type(emailInput, "valid@test.com")

    await waitFor(() => {
      expect(screen.queryByText(/Please enter a valid email/i)).not.toBeInTheDocument()
    })
  })

  // 3. ResetPasswordPage Cross-Field Passwords
  it("ResetPasswordPage: password edit reactively clears 'Passwords must match' error", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText(/New Password/i)
    const confirmInput = screen.getByLabelText(/Confirm Password/i)

    await user.type(passwordInput, "securepass1")
    await user.type(confirmInput, "securepass2")

    // Error appears
    expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()

    // Update password field to match
    await user.clear(passwordInput)
    await user.type(passwordInput, "securepass2")

    // Error clears
    await waitFor(() => {
      expect(screen.queryByText(/Passwords must match/i)).not.toBeInTheDocument()
    })
  })

  it("ResetPasswordPage: confirm edit reactively clears 'Passwords must match' error", async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    )

    const passwordInput = screen.getByLabelText(/New Password/i)
    const confirmInput = screen.getByLabelText(/Confirm Password/i)

    await user.type(passwordInput, "securepass1")
    await user.type(confirmInput, "differentpass")

    expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()

    await user.clear(confirmInput)
    await user.type(confirmInput, "securepass1")

    await waitFor(() => {
      expect(screen.queryByText(/Passwords must match/i)).not.toBeInTheDocument()
    })
  })

  // 4. ProfilePage Reactive Status Dismissal
  it("ProfilePage: typing in name input reactively clears status message", async () => {
    const user = userEvent.setup()
    const qc = new QueryClient()

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const nameInput = screen.getByLabelText(/Display Name/i)
    const submitBtn = screen.getByRole("button", { name: /Save changes/i })

    // Submit form to show success message
    await user.click(submitBtn)
    expect(await screen.findByText(/Profile updated successfully/i)).toBeInTheDocument()

    // Type in display name input
    await user.type(nameInput, " Updated")

    // Status message should be cleared reactively
    expect(screen.queryByText(/Profile updated successfully/i)).not.toBeInTheDocument()
  })
})
