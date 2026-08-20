import { z } from "zod"

export const expenseSchema = z
  .object({
    description: z.string().trim().min(1).max(160),
    amountMinor: z.number().int().positive(),
    currency: z.string().length(3),
    category: z.enum([
      "food",
      "transport",
      "accommodation",
      "tickets",
      "shopping",
      "other",
    ]),
    expenseDate: z.string().min(1),
    notes: z.string().max(2000).nullable().optional(),
    receiptPath: z.string().nullable().optional().refine((v) => !v || (!v.includes("..") && v.split("/").length >= 3), { message: "Receipt must be <trip_id>/<expense_id>/file.ext without .." }),
    payers: z
      .array(
        z.object({
          userId: z.string().min(1),
          amountPaidMinor: z.number().int().positive(),
        }),
      )
      .min(1),
    splits: z
      .array(
        z.object({
          userId: z.string().min(1),
          amountOwedMinor: z.number().int().min(0),
        }),
      )
      .min(1),
    requestId: z.string().uuid(),
    tripId: z.string().uuid().or(z.string().min(1)),
    expenseId: z.string().uuid().optional(),
    expectedUpdatedAt: z.string().nullable().optional(),
  })
  .refine(
    (d) =>
      d.payers.reduce((s, p) => s + p.amountPaidMinor, 0) === d.amountMinor,
    { path: ["payers"], message: "Payer sum must equal total" },
  )
  .refine(
    (d) =>
      d.splits.reduce((s, p) => s + p.amountOwedMinor, 0) === d.amountMinor,
    { path: ["splits"], message: "Split sum must equal total" },
  )

export type SaveExpenseInput = z.infer<typeof expenseSchema>
