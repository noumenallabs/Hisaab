export function ErrorState({
  message,
  onRetry,
}: {
  message: string; onRetry?: () => void
}) {
  return (
    <div className="rounded-xl border border-owe/20 bg-owe-soft p-6 text-center">
      <p className="text-sm font-semibold text-owe">Something went wrong</p>
      <p className="mt-1 text-sm text-ink-soft">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 h-9 rounded-md border border-hair bg-surface px-4 text-sm font-semibold"
        >
          Retry
        </button>
      )}
    </div>
  )
}
