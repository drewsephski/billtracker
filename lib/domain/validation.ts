import { z } from "zod";
import { categories, parseMoney, validDate } from "./bills";
export const idSchema = z.uuid();
export const moneySchema = z.string().transform((value, ctx) => {
  try {
    return parseMoney(value);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "Use dollars and cents, for example 186.42.",
    });
    return z.NEVER;
  }
});
export const householdSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timeZone: z.string().refine((zone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone."),
});
export const billSchema = z.object({
  name: z.string().trim().min(1, "Give this bill a name.").max(100),
  category: z.enum(categories),
  amount: moneySchema.refine((n) => n > 0, "The amount must be positive."),
  dueDate: z.string().refine(validDate, "Choose a valid date."),
  splitMode: z.enum(["equal", "custom"]),
  memberIds: z.array(idSchema).min(1).max(30),
  customAmounts: z.record(z.string(), z.string()).default({}),
  recurring: z.boolean().default(false),
  notes: z.string().trim().max(500).default(""),
});
export type BillInput = z.input<typeof billSchema>;
export const authSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(80).optional(),
});
export const invitationSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
});
