import { UserAvatar } from "@/components/feedback/UserAvatar"

/**
 * @deprecated Legacy Avatar component. Use `UserAvatar` from `@/components/feedback/UserAvatar` instead.
 */
export function Avatar({
  id,
  size = 32,
  name,
  avatar,
}: {
  id: string
  size?: number
  name?: string
  avatar?: string
}) {
  const sizeMap: Record<number, "xs" | "sm" | "md" | "lg" | "xl"> = {
    20: "xs",
    24: "sm",
    26: "sm",
    32: "md",
    36: "lg",
    64: "xl",
  }
  const mappedSize = sizeMap[size] ?? (size < 24 ? "xs" : size < 32 ? "sm" : size < 48 ? "md" : "lg")
  return <UserAvatar id={id} name={name} avatar={avatar} size={mappedSize} />
}
