import { Outlet } from "react-router"
import { AppHeader } from "@/components/navigation/AppHeader"

export function AppLayout() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <AppHeader />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-6 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}

