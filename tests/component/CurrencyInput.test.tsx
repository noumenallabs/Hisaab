import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CurrencyInput } from "@/components/forms/CurrencyInput"

describe("CurrencyInput Component", () => {
  it("renders with default INR currency and dynamic 2-decimal formatting", () => {
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={1050} onChange={onChange} />)

    expect(screen.getByText("INR")).toBeInTheDocument()
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("10.5")
    expect(input.placeholder).toBe("0")
  })

  it("handles JPY with 0 decimals dynamically via decimalsFor", () => {
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={1500} onChange={onChange} currency="JPY" />)

    expect(screen.getByText("JPY")).toBeInTheDocument()
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("1500")
    expect(input.placeholder).toBe("0")
  })

  it("handles USD with 2 decimals dynamically", () => {
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={2500} onChange={onChange} currency="USD" />)

    expect(screen.getByText("USD")).toBeInTheDocument()
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("25")
  })

  it("calls onChange with parsed minor units when user types", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={null} onChange={onChange} currency="INR" />)

    const input = screen.getByRole("textbox")
    await user.type(input, "45.75")

    expect(onChange).toHaveBeenLastCalledWith(4575)
  })

  it("calls onChange with integer minor units for zero-decimal currencies (JPY)", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={null} onChange={onChange} currency="JPY" />)

    const input = screen.getByRole("textbox")
    await user.type(input, "300")

    expect(onChange).toHaveBeenLastCalledWith(300)
  })

  it("returns null on invalid input (non-numeric or exceeding decimals)", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={null} onChange={onChange} currency="INR" />)

    const input = screen.getByRole("textbox")
    await user.type(input, "abc")
    expect(onChange).toHaveBeenLastCalledWith(null)

    await user.clear(input)
    await user.type(input, "12.345") // 3 decimal places for INR (max 2)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it("synchronizes input value when external valueMinor prop changes", () => {
    const onChange = vi.fn()
    const { rerender } = render(<CurrencyInput valueMinor={1000} onChange={onChange} currency="INR" />)

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("10")

    // Update prop externally to 2550 minor (25.50 major)
    rerender(<CurrencyInput valueMinor={2550} onChange={onChange} currency="INR" />)
    expect(input.value).toBe("25.5")

    // Clear prop to null
    rerender(<CurrencyInput valueMinor={null} onChange={onChange} currency="INR" />)
    expect(input.value).toBe("")
  })

  it("respects custom decimals prop overriding currency default", async () => {
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={12345} onChange={onChange} currency="INR" decimals={3} />)

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("12.345")
    expect(input.placeholder).toBe("0")
  })

  it("supports custom placeholder", () => {
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={null} onChange={onChange} placeholder="Enter amount" />)
    const input = screen.getByPlaceholderText("Enter amount")
    expect(input).toBeInTheDocument()
  })

  it("supports disabled state, accessibility attributes and custom classes", () => {
    const onChange = vi.fn()
    render(
      <CurrencyInput
        valueMinor={500}
        onChange={onChange}
        disabled={true}
        id="test-currency-input"
        name="amount"
        className="custom-container-class"
        aria-label="Amount in INR"
        aria-describedby="amount-hint"
        aria-invalid={true}
      />
    )

    const input = screen.getByRole("textbox")
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute("id", "test-currency-input")
    expect(input).toHaveAttribute("name", "amount")
    expect(input).toHaveAttribute("aria-label", "Amount in INR")
    expect(input).toHaveAttribute("aria-describedby", "amount-hint")
    expect(input).toHaveAttribute("aria-invalid", "true")
  })

  it("handles commas in currency input appropriately", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CurrencyInput valueMinor={null} onChange={onChange} currency="INR" />)

    const input = screen.getByRole("textbox")
    await user.type(input, "1,250.50")
    expect(onChange).toHaveBeenLastCalledWith(125050)
  })
})
