import { z } from "zod"
export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
export const signUpSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().email(),
    password: z.string().min(8),
    confirm: z.string().min(8),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  })
export const resetSchema = z.object({ email: z.string().email() })
