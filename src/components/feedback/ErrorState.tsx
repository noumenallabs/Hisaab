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
          className="mt-3 min-h-11 rounded-xl border border-hair bg-surface px-5 text-sm font-semibold text-ink hover:bg-canvas transition-colors shadow-2xs"
        >
          Retry
        </button>
      )}
    </div>
  )
}
