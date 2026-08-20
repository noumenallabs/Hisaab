import { RouterProvider } from "react-router"
import { Providers } from "./providers"
import { router } from "./routes"
import { ErrorBoundary } from "./errors/ErrorBoundary"

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  )
}
