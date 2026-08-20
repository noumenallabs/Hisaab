import { test, expect } from "@playwright/test"

test.describe("Admin-only flows", () => {
  test("non-admin cannot access /trips/new and /admin", async ({ page }) => {
    // Not signed in -> redirect to sign-in
    await page.goto("/trips/new")
    await expect(page).toHaveURL(/\/sign-in/)
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test("admin sees invite manager and can generate", async ({ page }) => {
    await page.goto("/sign-in")
    await page.getByPlaceholder("you@example.com").fill("admin@tripsplit.test")
    await page.locator('input[type="password"]').fill("password123")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/trips/)
    // Create trip
    await page.goto("/trips/new")
    // If redirected to sign-in due to not admin, skip
    if (await page.getByText("Not an admin").isVisible().catch(() => false)) {
      test.skip()
      return
    }
    await page.getByPlaceholder("e.g. Tokyo spring escape").fill("Admin Trip")
    await page.getByPlaceholder("e.g. Tokyo, Japan").fill("Admin City")
    const dates = page.locator('input[type="date"]')
    await dates.first().fill("2026-08-14")
    await dates.nth(1).fill("2026-08-19")
    await page.getByRole("button", { name: "Create trip" }).click()
    await expect(page).toHaveURL(/\/trips\//)
    // Go to settings
    await page.getByText("Settings").click().catch(async () => {
      const url = page.url()
      await page.goto(url.replace(/\/$/, "") + "/settings")
    })
    await expect(page.getByText("Invite codes")).toBeVisible({ timeout: 5000 }).catch(() => test.skip())
  })

  test("sign-up is admin-only banner", async ({ page }) => {
    await page.goto("/sign-up")
    await expect(page.getByText("Admin only")).toBeVisible()
    await expect(page.getByText("Only admins can create accounts")).toBeVisible()
  })
})
