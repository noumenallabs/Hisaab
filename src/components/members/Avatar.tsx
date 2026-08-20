export function Avatar({ id, size = 32, name, avatar }: { id: string; size?: number; name?: string; avatar?: string }) {
  const palette: Record<string, string> = { u_arun: "#2563eb", u_priya: "#0e9f6e", u_dev: "#c2410c", u_sara: "#7c3aed" }
  const display = avatar ?? (name ? name.slice(0,2).toUpperCase() : id.slice(0,2).toUpperCase())
  const title = name ?? id
  return (
    <span className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0" style={{ width: size, height: size, background: palette[id] ?? "#5b6672", fontSize: size * 0.4 }} title={title}>
      {display}
    </span>
  )
}
