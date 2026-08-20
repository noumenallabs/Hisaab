import { describe, it, expect, vi } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { AppHeader } from "@/components/navigation/AppHeader"
import { TripNavigation } from "@/components/navigation/TripNavigation"

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Arun", email: "a@b.com" }, signOut: vi.fn() }) }))

describe("navigation", () => {
  it("AppHeader renders Hissaab and user", () => {
    render(<MemoryRouter><AppHeader /></MemoryRouter>)
    expect(screen.getByText("Hissaab")).toBeInTheDocument()
    expect(screen.getByText("Arun")).toBeInTheDocument()
  })
  it("TripNavigation renders tabs and active", () => {
    render(<MemoryRouter initialEntries={["/trips/t1"]}><TripNavigation tripId="t1" base="/trips/t1" /></MemoryRouter>)
    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByText("Expenses")).toBeInTheDocument()
    expect(screen.getByText("Balances")).toBeInTheDocument()
    expect(screen.getByText("Activity")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })
})
