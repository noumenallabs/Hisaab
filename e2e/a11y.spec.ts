import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const viewports = [
  { w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 },
] as const
const routes = ["/sign-in", "/trips", "/join"] as const

test.describe("a11y", () => {
  for (const { w, h } of viewports) {
    for (const route of routes) {
      test(`${route} @ ${w}x${h} has no serious/critical axe violations`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h })
        await page.goto(route)
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
        const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
        expect(serious, serious.map((v) => `${v.id}: ${v.description}\n${v.nodes.map((n) => n.html).join("\n")}`).join("\n\n")).toEqual([])
      })
    }
  }

  test("200% zoom and prefers-reduced-motion do not introduce serious violations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/sign-in")
    await page.evaluate(() => { (document.documentElement as any).style.zoom = "200%" })
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    expect(serious, serious.map((v) => `${v.id}: ${v.description}`).join("\n")).toEqual([])
  })
})
