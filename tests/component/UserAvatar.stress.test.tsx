import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { UserAvatar } from "@/components/feedback/UserAvatar"
import { AvatarStack } from "@/components/members/AvatarStack"

describe("UserAvatar & AvatarStack — Empirical Stress & Adversarial Testing", () => {
  describe("UserAvatar Component Edge Cases", () => {
    it("renders fallback '?' gracefully when name and id are both undefined or empty", () => {
      const { unmount } = render(<UserAvatar />)
      expect(screen.getByText("?")).toBeInTheDocument()
      expect(screen.getByLabelText("?")).toBeInTheDocument()
      unmount()

      render(<UserAvatar name="" id="" />)
      expect(screen.getByText("?")).toBeInTheDocument()
    })

    it("handles whitespace-only name and id without crashing or producing empty initials", () => {
      const { container, unmount } = render(<UserAvatar name="   " id="   " />)
      expect(screen.getByText("?")).toBeInTheDocument()
      expect(container.firstChild).toHaveAttribute("aria-label", "   ")
      unmount()

      const { container: c2 } = render(<UserAvatar name="   " />)
      expect(screen.getByText("?")).toBeInTheDocument()
      expect(c2.firstChild).toHaveAttribute("aria-label", "   ")
    })

    it("strips 'u_' prefix from id when name is absent, deriving correct initial and label", () => {
      const { unmount } = render(<UserAvatar id="u_vikram" />)
      expect(screen.getByText("V")).toBeInTheDocument()
      expect(screen.getByLabelText("vikram")).toBeInTheDocument()
      expect(screen.getByTitle("vikram")).toBeInTheDocument()
      unmount()

      const { container } = render(<UserAvatar id="u_" />)
      expect(screen.getByText("?")).toBeInTheDocument()
      expect(container.firstChild).toHaveAttribute("aria-label", "")
    })

    it("handles ids without 'u_' prefix correctly", () => {
      render(<UserAvatar id="user-uuid-9988" />)
      expect(screen.getByText("U")).toBeInTheDocument()
      expect(screen.getByLabelText("user-uuid-9988")).toBeInTheDocument()
    })

    it("handles names starting with numbers, punctuation, and symbols safely", () => {
      const cases = [
        { name: "007 Agent", expected: "0" },
        { name: "99 Problems", expected: "9" },
        { name: "!Important Person", expected: "!" },
        { name: "@alice", expected: "@" },
        { name: "#1 Travel Team", expected: "#" },
        { name: "$Millionaire", expected: "$" },
        { name: "<script>alert(1)</script>", expected: "<" },
        { name: "&quot;Quoted&quot;", expected: "&" },
        { name: "O'Connor", expected: "O" },
      ]

      for (const { name, expected } of cases) {
        const { unmount } = render(<UserAvatar name={name} />)
        expect(screen.getByText(expected)).toBeInTheDocument()
        unmount()
      }
    })

    it("handles single and multi-byte emojis as names", () => {
      const emojiCases = [
        { name: "🚀 Rocket", expected: "🚀" },
        { name: "🍕 Pizza Lover", expected: "🍕" },
        { name: "✨ Star", expected: "✨" },
        { name: "🔥 Flame", expected: "🔥" },
      ]

      for (const { name, expected } of emojiCases) {
        const { unmount } = render(<UserAvatar name={name} />)
        expect(screen.getByLabelText(name)).toBeInTheDocument()
        unmount()
      }
    })

    it("handles multi-lingual unicode characters and diacritics", () => {
      const unicodeCases = [
        { name: "Álvaro", expected: "Á" },
        { name: "Éléonore", expected: "É" },
        { name: "Владимир", expected: "В" },
        { name: "日本語", expected: "日" },
        { name: "देव कपूर", expected: "द" },
        { name: "عمر", expected: "ع" },
        { name: "Åke", expected: "Å" },
        { name: "Øyvind", expected: "Ø" },
      ]

      for (const { name, expected } of unicodeCases) {
        const { unmount } = render(<UserAvatar name={name} />)
        expect(screen.getByText(expected)).toBeInTheDocument()
        expect(screen.getByLabelText(name)).toBeInTheDocument()
        unmount()
      }
    })

    it("allows custom avatar override initials", () => {
      const { unmount } = render(<UserAvatar name="John Doe" avatar="JD" />)
      expect(screen.getByText("JD")).toBeInTheDocument()
      expect(screen.getByLabelText("John Doe")).toBeInTheDocument()
      unmount()

      render(<UserAvatar name="VIP Guest" avatar="⭐" />)
      expect(screen.getByText("⭐")).toBeInTheDocument()
    })

    it("renders isCurrentUser with highlight ring and (You) title text", () => {
      const { unmount } = render(<UserAvatar name="Dev Kapoor" isCurrentUser={true} />)
      const el = screen.getByTitle("Dev Kapoor (You)")
      expect(el).toHaveClass("ring-2")
      expect(el).toHaveClass("ring-brand")
      expect(el).toHaveClass("shadow-2xs")
      unmount()

      render(<UserAvatar name="Dev Kapoor" isCurrentUser={false} />)
      const normalEl = screen.getByTitle("Dev Kapoor")
      expect(normalEl).not.toHaveClass("ring-2")
      expect(normalEl.title).toBe("Dev Kapoor")
    })

    it("supports all 5 size variants (xs, sm, md, lg, xl)", () => {
      const sizes: Array<{ size: "xs" | "sm" | "md" | "lg" | "xl"; expectedClass: string }> = [
        { size: "xs", expectedClass: "h-5 w-5" },
        { size: "sm", expectedClass: "h-6 w-6" },
        { size: "md", expectedClass: "h-7 w-7" },
        { size: "lg", expectedClass: "h-9 w-9" },
        { size: "xl", expectedClass: "h-16 w-16" },
      ]

      for (const { size, expectedClass } of sizes) {
        const { unmount } = render(<UserAvatar name="Test Size" size={size} />)
        const el = screen.getByLabelText("Test Size")
        for (const cls of expectedClass.split(" ")) {
          expect(el).toHaveClass(cls)
        }
        unmount()
      }
    })

    it("merges custom className without overriding fundamental avatar properties", () => {
      render(<UserAvatar name="Custom Class" className="opacity-75 cursor-pointer z-10" />)
      const el = screen.getByLabelText("Custom Class")
      expect(el).toHaveClass("opacity-75")
      expect(el).toHaveClass("cursor-pointer")
      expect(el).toHaveClass("z-10")
      expect(el).toHaveClass("rounded-full")
    })

    it("deterministically computes the exact same palette for identical seeds across 500 iterations", () => {
      const seedIds = ["u_arun", "u_priya", "u_dev", "u_sara", "u_alex_99", "u_custom_user_123"]
      for (const id of seedIds) {
        const initialRender = render(<UserAvatar id={id} />)
        const initialClass = screen.getByLabelText(id.replace(/^u_/, "")).className
        initialRender.unmount()

        for (let i = 0; i < 50; i++) {
          const r = render(<UserAvatar id={id} />)
          const currentClass = screen.getByLabelText(id.replace(/^u_/, "")).className
          expect(currentClass).toBe(initialClass)
          r.unmount()
        }
      }
    })

    it("distributes varied user IDs across all available color palettes", () => {
      const paletteSet = new Set<string>()
      // Generate 100 distinct IDs to ensure all 7 palettes are hit
      for (let i = 0; i < 100; i++) {
        const { unmount } = render(<UserAvatar id={`user_${i}_${i * 37}`} />)
        const el = screen.getByLabelText(`user_${i}_${i * 37}`)
        const colorClasses = Array.from(el.classList).filter((c) => c.startsWith("bg-") && !c.includes("dark:"))
        colorClasses.forEach((c) => paletteSet.add(c))
        unmount()
      }

      // We expect multiple unique palettes (blue, purple, emerald, amber, rose, indigo, teal)
      expect(paletteSet.size).toBeGreaterThanOrEqual(6)
    })
  })

  describe("AvatarStack Component Adversarial & Overflow Stress Testing", () => {
    it("renders empty stack without error when ids is empty array", () => {
      const { container } = render(<AvatarStack ids={[]} />)
      expect(container.firstChild).toBeInTheDocument()
      expect(container.querySelectorAll("span").length).toBe(0)
    })

    it("handles missing names map gracefully by falling back to id-based avatar", () => {
      const { unmount } = render(<AvatarStack ids={["u_alice", "u_bob"]} />)
      expect(screen.getByTitle("u_alice")).toBeInTheDocument()
      expect(screen.getByTitle("u_bob")).toBeInTheDocument()
      unmount()

      render(<AvatarStack ids={["u_alice", "u_bob"]} names={undefined} />)
      expect(screen.getByTitle("u_alice")).toBeInTheDocument()
    })

    it("handles partial names map (some IDs present, some missing)", () => {
      const names = { u_alice: "Alice Smith" }
      render(<AvatarStack ids={["u_alice", "u_charlie"]} names={names} />)
      expect(screen.getByTitle("Alice Smith")).toBeInTheDocument()
      expect(screen.getByTitle("u_charlie")).toBeInTheDocument()
    })

    it("renders 1 to 4 members with correct negative margin stacking offsets", () => {
      const ids = ["u_1", "u_2", "u_3", "u_4"]
      const names = { u_1: "One", u_2: "Two", u_3: "Three", u_4: "Four" }
      const { container } = render(<AvatarStack ids={ids} names={names} />)

      const wrappers = container.querySelectorAll("div.flex > span")
      expect(wrappers.length).toBe(4)
      expect(wrappers[0]).toHaveStyle({ marginLeft: "0px" })
      expect(wrappers[1]).toHaveStyle({ marginLeft: "-8px" })
      expect(wrappers[2]).toHaveStyle({ marginLeft: "-8px" })
      expect(wrappers[3]).toHaveStyle({ marginLeft: "-8px" })
    })

    it("stress tests stack overflow: renders 100 members without crashing, freezing, or throwing", () => {
      const count = 100
      const ids = Array.from({ length: count }, (_, i) => `user_${i}`)
      const names = Object.fromEntries(ids.map((id, i) => [id, `Member ${i}`]))

      const startTime = performance.now()
      const { container } = render(<AvatarStack ids={ids} names={names} />)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(1000) // Must render in under 1 second
      const wrappers = container.querySelectorAll("div.flex > span")
      expect(wrappers.length).toBe(count)
      expect(screen.getByTitle("Member 0")).toBeInTheDocument()
      expect(screen.getByTitle("Member 99")).toBeInTheDocument()
    })

    it("handles non-prefixed IDs and special characters in AvatarStack", () => {
      const ids = ["arun-1", "user@company.com", "special_$_id"]
      const names = {
        "arun-1": "Arun Number One",
        "user@company.com": "Email User",
        "special_$_id": "Special ID",
      }
      render(<AvatarStack ids={ids} names={names} />)
      expect(screen.getByTitle("Arun Number One")).toBeInTheDocument()
      expect(screen.getByTitle("Email User")).toBeInTheDocument()
      expect(screen.getByTitle("Special ID")).toBeInTheDocument()
    })
  })
})
