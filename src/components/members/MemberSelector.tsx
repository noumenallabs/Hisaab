export function MemberSelector({ value, onChange, members = [] }: { value: string[]; onChange: (ids: string[]) => void; members?: { id: string; name: string }[] }) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {members.map(m => (
        <button key={m.id} type="button" onClick={() => toggle(m.id)} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${value.includes(m.id) ? "border-brand bg-brand-soft text-brand" : "border-hair bg-surface text-ink-soft"}`}>
          {m.name}
        </button>
      ))}
    </div>
  )
}
