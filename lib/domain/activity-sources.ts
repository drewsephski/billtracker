import { z } from "zod";

export const MAX_SOURCE_BYTES = 1_000_000;
export const MAX_SOURCE_TEXT = 6000;
export const activitySourceSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(MAX_SOURCE_TEXT),
});
export const activitySourcesSchema = z.array(activitySourceSchema).max(2);
export type ActivitySource = z.infer<typeof activitySourceSchema>;
