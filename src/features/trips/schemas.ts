import { z } from "zod"

export const tripSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    destination: z.string().trim().min(1).max(120),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    baseCurrency: z
      .string()
      .length(3)
      .transform((s) => s.toUpperCase()),
  })
  .refine((d) => d.endDate >= d.startDate, {
    path: ["endDate"],
    message: "End date must be on or after start",
  })
export type TripInput = z.infer<typeof tripSchema>
