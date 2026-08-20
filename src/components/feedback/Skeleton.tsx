export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-hair ${className}`} />
}
export function FullPageSkeleton() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas">
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
    </main>
  )
}
