import { UserAvatar } from "@/components/feedback/UserAvatar"

export function AvatarStack({
  ids,
  names,
}: {
  ids: string[]
  names?: Record<string, string>
}) {
  return (
    <div className="flex items-center">
      {ids.map((id, i) => {
        const name = names?.[id] ?? id
        return (
          <span
            key={id}
            className="rounded-full ring-2 ring-surface"
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            <UserAvatar id={id} name={name} size="sm" />
          </span>
        )
      })}
    </div>
  )
}
