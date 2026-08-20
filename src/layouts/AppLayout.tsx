import { Outlet } from "react-router"
import { AppHeader } from "@/components/navigation/AppHeader"

export function AppLayout() {
  return (
    <main className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-5 sm:px-8">
        <AppHeader />
        <div id="main-content" className="pt-6"><Outlet /></div>
      </div>
    </main>
  )
}
