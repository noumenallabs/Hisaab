import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider, useTheme, THEME_STORAGE_KEY } from "@/lib/theme"

function TestConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("system")}>Set System</button>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  )
}

describe("Theme System", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ""
  })

  it("defaults to system theme and respects light system preference", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme").textContent).toBe("system")
    expect(screen.getByTestId("resolved").textContent).toBe("light")
    expect(document.documentElement.classList.contains("light")).toBe(true)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("sets dark theme, updates DOM class, and persists to localStorage", async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    await user.click(screen.getByText("Set Dark"))

    expect(screen.getByTestId("theme").textContent).toBe("dark")
    expect(screen.getByTestId("resolved").textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.classList.contains("light")).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
  })

  it("toggles between dark and light", async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    // Current is light -> toggle to dark
    await user.click(screen.getByText("Toggle"))
    expect(screen.getByTestId("resolved").textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    // Current is dark -> toggle to light
    await user.click(screen.getByText("Toggle"))
    expect(screen.getByTestId("resolved").textContent).toBe("light")
    expect(document.documentElement.classList.contains("light")).toBe(true)
  })

  it("loads stored theme on mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark")
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId("theme").textContent).toBe("dark")
    expect(screen.getByTestId("resolved").textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
