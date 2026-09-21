import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  activeActivityContext,
  activityBody,
  activityError,
} from "@/lib/server/activity-http";
import { confirmChatActivity } from "@/lib/server/chat-activity";
import { confirmActivity } from "@/lib/server/activity";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = z
      .object({
        householdId: z.uuid(),
        token: z.string().max(32_000).optional(),
        chatMessageId: z.uuid().optional(),
      })
      .refine((v) => Boolean(v.token) !== Boolean(v.chatMessageId))
      .parse(await activityBody(request));
    const { user, householdId } = await activeActivityContext(body.householdId);
    const result = body.chatMessageId
      ? await confirmChatActivity(user, householdId, body.chatMessageId)
      : await confirmActivity(user, householdId, body.token!);
    if (result.kind === "success") {
      revalidatePath("/chat");
      revalidatePath("/dashboard");
      revalidatePath("/bills");
      if (result.billUrl) revalidatePath(result.billUrl);
    }
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { kind: "error", message: activityError(error) },
      { status: 400 },
    );
  }
}
