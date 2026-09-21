import { after } from "next/server";
import { z } from "zod";
import {
  activeActivityContext,
  activityBody,
  activityError,
} from "@/lib/server/activity-http";
import {
  listChat,
  sendChat,
  processChat,
  recoverChat,
} from "@/lib/server/chat";
import { chatCursorSchema } from "@/lib/domain/chat";
export const runtime = "nodejs";
export const maxDuration = 90;
const querySchema = z
  .object({
    before: chatCursorSchema.optional(),
    after: chatCursorSchema.optional(),
    watch: z.array(z.uuid()).max(100),
  })
  .refine((v) => !(v.before && v.after));
async function context(request: Request) {
  // A stale-page guard only: active household is selected from server membership
  // and its HTTP-only cookie, never from a client-supplied household/member ID.
  const expected = z.uuid().parse(request.headers.get("x-homeshare-household"));
  return activeActivityContext(expected);
}
export async function GET(request: Request) {
  try {
    const { user, householdId } = await context(request);
    const query = new URL(request.url).searchParams;
    const options = querySchema.parse({
      before: query.get("before") ?? undefined,
      after: query.get("after") ?? undefined,
      watch: query.getAll("watch"),
    });
    const page = await listChat(user, householdId, options);
    after(async () => {
      await recoverChat(user, householdId).catch(() => {});
    });
    return Response.json(page, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: activityError(error) },
      {
        status:
          error instanceof Error &&
          error.message.includes("active household changed")
            ? 409
            : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export async function POST(request: Request) {
  try {
    const raw = await activityBody(request);
    const { user, householdId } = await context(request);
    const message = await sendChat(user, householdId, raw);
    after(async () => {
      await processChat(user, householdId, message.id).catch(() => {});
    });
    return Response.json(
      { message, householdId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: activityError(error) }, { status: 400 });
  }
}
