export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-hair/60 ${className}`} />
}

export function FullPageSkeleton() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-canvas p-6">
      <div className="space-y-4 text-center">
        <Skeleton className="mx-auto h-10 w-48 rounded-xl" />
        <Skeleton className="mx-auto h-4 w-72 rounded-lg" />
      </div>
    </main>
  )
}

export function FormSkeleton() {
  return (
    <div className="mx-auto max-w-lg space-y-5" aria-label="Loading form" role="status">
      <Skeleton className="h-4 w-28 rounded-md" />
      <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-24 rounded" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        </div>
        <div className="pt-3">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function BalancesSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading balances" role="status">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Skeleton className="h-4 w-36 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export function ExpenseListSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading expenses" role="status">
      <div className="h-14 rounded-2xl border border-hair bg-surface p-3">
        <Skeleton className="h-8 w-full rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-28 rounded" />
        <div className="rounded-2xl border border-hair bg-surface divide-y divide-hair">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
            </div>
            <Skeleton className="h-5 w-20 rounded" />
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
            </div>
            <Skeleton className="h-5 w-20 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
