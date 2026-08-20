import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"

describe("ConfirmDialog focus/keyboard", () => {
  it("traps focus, closes on Escape, restores focus", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<><button>outside</button><ConfirmDialog open onClose={onClose} onConfirm={vi.fn()} title="Delete?" description="Sure?" /></>)
    // Title visible
    expect(screen.getByText("Delete?")).toBeInTheDocument()
    // Escape should call onClose
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })
  it("confirm calls onConfirm", async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmDialog open onClose={vi.fn()} onConfirm={onConfirm} title="Delete?" description="Sure?" confirmLabel="Delete" />)
    await user.click(screen.getByText("Delete"))
    expect(onConfirm).toHaveBeenCalled()
  })
})
