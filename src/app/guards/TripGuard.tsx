import { Outlet, useParams, Link } from "react-router"
import { useTrip } from "@/features/trips/hooks"
import { FullPageSkeleton } from "@/components/feedback/Skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"

export function TripGuard() {
  const { tripId } = useParams()
  const { data: trip, isLoading, error, refetch } = useTrip(tripId!)
  if (isLoading) return <FullPageSkeleton />
  if (error)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas p-6">
        <ErrorState
          message={(error as Error).message}
          onRetry={() => refetch()}
        />
      </main>
    )
  if (!trip)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas p-6 text-center">
        <h1 className="text-2xl font-bold">Trip not found</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">
          You don’t have access or it doesn’t exist.
        </p>
        <Link to="/trips" className="mt-4 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white">
          Back to trips
        </Link>
      </main>
    )
  return <Outlet />
}
