import { timingSafeEqual } from "node:crypto";
import { generateScheduled } from "@/lib/server/recurrence";
export const maxDuration = 60;
export async function GET(request: Request) {
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    !process.env.CRON_SECRET ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ generated: await generateScheduled() });
}
