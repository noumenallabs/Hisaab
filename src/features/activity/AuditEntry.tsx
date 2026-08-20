export function AuditEntry({ entry }: { entry: { id: string | number; action: string; entity_type?: string; entity?: string; summary?: string; created_at?: string; at?: string; changed_fields?: string[]; previous_values?: any; new_values?: any } }) {
  const when = entry.created_at ?? entry.at ?? ""
  const entity = entry.entity_type ?? entry.entity ?? "record"
  const summary = entry.summary ?? `${entry.action} ${entity}`
  return (
    <div className="rounded-xl border border-hair bg-surface p-4">
      <p className="text-sm leading-6"><span className="font-semibold capitalize">{entry.action}</span> <span className="text-ink-soft">{entity}</span> — <span className="text-ink-soft">{summary}</span></p>
      <p className="mt-1 text-xs text-ink-faint">{when ? new Date(when).toLocaleString() : ""} {entry.changed_fields?.length ? `· ${entry.changed_fields.join(", ")}` : ""}</p>
      {entry.previous_values || entry.new_values ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold text-brand">Show changes</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-canvas p-3 text-[11px] leading-4">{JSON.stringify({ from: entry.previous_values, to: entry.new_values }, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  )
}
