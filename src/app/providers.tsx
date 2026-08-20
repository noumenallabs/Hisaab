import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/queryClient"
import { AuthProvider } from "@/lib/auth"
import { ToastProvider } from "@/components/feedback/ToastProvider"
import { OfflineBanner } from "@/components/feedback/OfflineBanner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <OfflineBanner />
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
