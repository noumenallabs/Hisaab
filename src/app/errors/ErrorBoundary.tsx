import { Component, type ReactNode } from "react"
import { useRouteError, isRouteErrorResponse, Link } from "react-router"

type Props = { children: ReactNode }
type State = { hasError: boolean; error: unknown }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }
  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary]", error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg p-6" role="alert">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-soft">Please try again or go back. If this keeps happening, contact support.</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white"
            >
              Retry
            </button>
            <Link to="/trips" className="min-h-11 inline-flex items-center rounded-xl border border-hair px-4 text-sm font-semibold">
              Go to trips
            </Link>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  let title = "Something went wrong"
  let message = "An unexpected error occurred. Please try again or return to your trips."

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText}`
    message = error.data?.message || message
  } else if (error instanceof Error) {
    message = error.message
  }

  return (
    <main className="grid min-h-[60vh] place-items-center bg-canvas p-6 text-center" role="alert">
      <div className="max-w-md rounded-2xl border border-hair bg-surface p-8 shadow-sm">
        <span className="inline-block text-3xl mb-2">⚠️</span>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Reload page
          </button>
          <Link
            to="/trips"
            className="min-h-11 inline-flex items-center rounded-xl border border-hair bg-surface px-5 text-sm font-semibold hover:bg-canvas transition-colors"
          >
            Back to trips
          </Link>
        </div>
      </div>
    </main>
  )
}
