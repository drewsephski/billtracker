import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { continueChatActivity } from "@/lib/server/chat-activity";
import { z } from "zod";
import {
  activeActivityContext,
  activityBody,
  activityError,
} from "@/lib/server/activity-http";
import { readHousehold } from "@/lib/server/queries";
import { chooseActivity, prepareActivity } from "@/lib/server/activity";
import { verifyActivity } from "@/lib/server/activity-token";
import { interpretActivity } from "@/lib/server/activity-interpreter";
import { activitySourcesSchema } from "@/lib/domain/activity-sources";
import { promptPlaceholder } from "@/lib/domain/activity-prompts";
import { DomainError } from "@/lib/domain/bills";
import { normalizeName } from "@/lib/domain/activity";
import type { ActivityMessage } from "@/lib/domain/activity-chat";
export const runtime = "nodejs";
export const maxDuration = 50;
const requestSchema = z.object({
  householdId: z.uuid(),
  sources: activitySourcesSchema.optional(),
  token: z.string().max(32_000).optional(),
  choice: z.number().int().min(0).max(1000).optional(),
  messages: z
    .array(
      z.object({
        role: z.literal("user"),
        parts: z
          .array(
            z.object({
              type: z.literal("text"),
              text: z.string().trim().min(1).max(1000),
            }),
          )
          .length(1),
      }),
    )
    .length(1),
});
export async function POST(request: Request) {
  try {
    const raw = await activityBody(request);
    if (raw && typeof raw === "object" && "chatMessageId" in raw) {
      const body = z
        .strictObject({
          householdId: z.uuid(),
          chatMessageId: z.uuid(),
          text: z.string().trim().min(1).max(1000).optional(),
          choice: z.number().int().min(0).max(1000).optional(),
          cancel: z.boolean().optional(),
          refresh: z.boolean().optional(),
          clientKey: z.uuid().optional(),
        })
        .parse(raw);
      const { user, householdId } = await activeActivityContext(
        body.householdId,
      );
      return Response.json(
        await continueChatActivity(user, householdId, body.chatMessageId, body),
      );
    }
    const body = requestSchema.parse(raw);
    const { user, householdId } = await activeActivityContext(body.householdId);
    const data = await readHousehold(user, householdId);
    const prior = body.token
      ? verifyActivity(body.token, user.id, householdId)
      : undefined;
    const text = body.messages[0].parts[0].text;
    if (promptPlaceholder.test(text))
      throw new DomainError(
        "Fill in the highlighted details before sending this draft.",
      );
    const stream = createUIMessageStream<ActivityMessage>({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        let textStarted = false;
        const finishText = () => {
          if (textStarted) {
            writer.write({ type: "text-end", id: "summary" });
            textStarted = false;
          }
        };
        try {
          let reply;
          if (body.choice !== undefined && body.token)
            reply = chooseActivity(user, data, body.token, body.choice);
          else {
            const intent = await interpretActivity({
              text,
              history: prior?.history ?? [],
              previous: prior?.intent,
              householdName: data.household.name,
              today: data.today,
              signal: request.signal,
              sources: body.sources,
              onSummary: (delta) => {
                if (!delta) return;
                if (!textStarted) {
                  writer.write({ type: "text-start", id: "summary" });
                  textStarted = true;
                }
                writer.write({ type: "text-delta", id: "summary", delta });
              },
            });
            // Keep a clicked disambiguation only while its spoken reference is unchanged.
            const selection = prior
              ? {
                  ...(normalizeName(intent.payer ?? "") ===
                  normalizeName(prior.intent.payer ?? "")
                    ? { memberId: prior.selection.memberId }
                    : {}),
                  ...(normalizeName(intent.bill ?? "") ===
                    normalizeName(prior.intent.bill ?? "") &&
                  intent.dueDate === prior.intent.dueDate &&
                  intent.period === prior.intent.period
                    ? { billId: prior.selection.billId }
                    : {}),
                }
              : {};
            reply = prepareActivity(
              user,
              data,
              intent,
              [...(prior?.history ?? []), text],
              selection,
            );
          }
          finishText();
          writer.write({ type: "data-activity", data: reply });
        } catch (error) {
          finishText();
          writer.write({
            type: "data-activity",
            data: { kind: "error", message: activityError(error) },
          });
        }
        writer.write({ type: "finish" });
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    return Response.json({ error: activityError(error) }, { status: 400 });
  }
}
