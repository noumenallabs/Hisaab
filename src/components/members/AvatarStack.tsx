import { Avatar } from "./Avatar"

export function AvatarStack({ ids }: { ids: string[] }) {
  return (
    <div className="flex items-center">
      {ids.map((id, i) => (
        <span key={id} className="rounded-full ring-2 ring-surface" style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar id={id} size={26} />
        </span>
      ))}
    </div>
  )
}
