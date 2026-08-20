import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Avatar } from "@/components/members/Avatar"
import { AvatarStack } from "@/components/members/AvatarStack"
import { MemberSelector } from "@/components/members/MemberSelector"

describe("members components", () => {
  it("Avatar renders initials", () => { render(<Avatar id="u_arun" name="Arun Menon" avatar="AM" />); expect(screen.getByText("AM")).toBeInTheDocument() })
  it("AvatarStack renders multiple", () => { const { container } = render(<AvatarStack ids={["u_arun","u_priya","u_dev"]} />); expect(container.querySelectorAll("span").length).toBeGreaterThan(2) })
  const demoMembers = [
    { id: "u_arun", name: "Arun Menon" },
    { id: "u_priya", name: "Priya Nair" },
    { id: "u_dev", name: "Dev Kapoor" },
    { id: "u_sara", name: "Sara Iyer" },
  ]
  it("MemberSelector toggles", async () => {
    const onChange=vi.fn()
    const user=userEvent.setup()
    const { unmount } = render(<MemberSelector value={["u_arun"]} onChange={onChange} members={demoMembers} />)
    await user.click(screen.getByText("Priya Nair"))
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(["u_arun","u_priya"]))
    unmount()
    const onChange2=vi.fn()
    render(<MemberSelector value={["u_arun","u_priya"]} onChange={onChange2} members={demoMembers} />)
    await user.click(screen.getByText("Arun Menon"))
    expect(onChange2).toHaveBeenCalledWith(["u_priya"])
  })
})
