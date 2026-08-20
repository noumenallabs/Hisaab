import { test, expect } from "@playwright/test"

test("200% zoom no horizontal overflow", async ({ page }) => {
  await page.goto("/sign-in")
  // simulate 200% zoom via viewport scaling
  await page.setViewportSize({ width: 720, height: 900 }) // 1440 at 200% ~= 720
  await page.evaluate(() => document.body.style.zoom = "200%")
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5)
  expect(hasOverflow).toBe(false)
})
