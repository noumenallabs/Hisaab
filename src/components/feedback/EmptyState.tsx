export function EmptyState({
  title,
  description,
  action,
}: {
  title: string; description: string; action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-hair bg-surface p-10 text-center">
      <h3 className="font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-soft">
        {description}
      </p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
