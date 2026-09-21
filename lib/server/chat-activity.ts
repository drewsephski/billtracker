import "server-only";
import { and, eq } from "drizzle-orm";
import { chatJobs, chatMessages, members } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain/bills";
import type { Identity } from "./auth";
import { inHousehold } from "./households";
import { appendChatReply, publicReply, sendChat, lockChat } from "./chat";
import { chooseActivity, confirmActivity, prepareActivity } from "./activity";
import { verifyActivity } from "./activity-token";
import { interpretActivity } from "./activity-interpreter";
import { readHousehold } from "./queries";
import type { Transaction } from "@/lib/db";

async function ownedAction(
  tx: Transaction,
  user: Identity,
  householdId: string,
  messageId: string,
  lock = false,
) {
  const query = tx
    .select({ job: chatJobs, source: chatMessages })
    .from(chatJobs)
    .innerJoin(
      chatMessages,
      and(
        eq(chatMessages.id, chatJobs.sourceId),
        eq(chatMessages.householdId, householdId),
      ),
    )
    .where(
      and(
        eq(chatJobs.householdId, householdId),
        eq(chatJobs.activeMessageId, messageId),
      ),
    );
  const [row] = await (lock ? query.for("update", { of: chatJobs }) : query);
  if (!row || !row.job.token)
    throw new DomainError(
      "This activity is no longer pending. Refresh the conversation.",
    );
  // Membership and source author both matter, even for household owners.
  const [member] = await tx
    .select({ id: members.id })
    .from(members)
    .where(
      and(eq(members.householdId, householdId), eq(members.userId, user.id)),
    );
  if (row.source.senderId !== member?.id)
    throw new DomainError(
      "Only the roommate who sent this activity can confirm or change it.",
    );
  return { ...row, token: row.job.token };
}
export async function confirmChatActivity(
  user: Identity,
  householdId: string,
  messageId: string,
) {
  // A repeated confirmation after a committed result returns that result, without
  // re-running an old action. Otherwise existing financial command idempotency applies.
  const pending = await inHousehold(user, householdId, async (tx, actor) => {
    const [message] = await tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, messageId),
          eq(chatMessages.householdId, householdId),
        ),
      );
    if (!message?.sourceId) throw new DomainError("Activity not found.");
    const [source] = await tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, message.sourceId),
          eq(chatMessages.householdId, householdId),
        ),
      );
    if (source?.senderId !== actor.id)
      throw new DomainError(
        "Only the roommate who sent this activity can confirm it.",
      );
    const [job] = await tx
      .select()
      .from(chatJobs)
      .where(
        and(
          eq(chatJobs.sourceId, source.id),
          eq(chatJobs.householdId, householdId),
        ),
      );
    if (!job?.activeMessageId) {
      const rows = await tx
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.sourceId, source.id),
            eq(chatMessages.householdId, householdId),
            eq(chatMessages.kind, "system"),
          ),
        );
      const success = rows.find((r) => r.reply?.kind === "success");
      if (success?.reply) return { result: publicReply(success.reply) };
    }
    return { action: await ownedAction(tx, user, householdId, messageId) };
  });
  if (pending.result) return pending.result;
  const action = pending.action!;
  const result = await confirmActivity(user, householdId, action.token, {
    before: (tx) => lockChat(tx, householdId),
    after: async (tx, reply) => {
      // The financial transaction rolls back if cancellation/refresh won the race.
      await ownedAction(tx, user, householdId, messageId, true);
      await appendChatReply(
        tx,
        householdId,
        action.source.id,
        reply,
        reply.kind === "success" ? "system" : "assistant",
      );
    },
  });
  return publicReply(result);
}
export async function continueChatActivity(
  user: Identity,
  householdId: string,
  messageId: string,
  input: {
    text?: string;
    choice?: number;
    cancel?: boolean;
    clientKey?: string;
    refresh?: boolean;
  },
) {
  const action = await inHousehold(user, householdId, (tx) =>
    ownedAction(tx, user, householdId, messageId),
  );
  let reply;
  if (input.cancel)
    reply = {
      kind: "error" as const,
      message: "Activity cancelled. Nothing was recorded.",
    };
  else {
    const data = await readHousehold(user, householdId);
    if (input.refresh) {
      const prior = verifyActivity(action.token, user.id, householdId, {
        allowExpired: true,
      });
      reply = prepareActivity(
        user,
        data,
        prior.intent,
        prior.history,
        prior.selection,
      );
    } else if (input.choice !== undefined)
      reply = chooseActivity(user, data, action.token, input.choice);
    else {
      const prior = verifyActivity(action.token, user.id, householdId);
      const text = input.text?.trim();
      if (!text) throw new DomainError("Describe the correction first.");
      if (!input.clientKey) throw new DomainError("A send key is required.");
      await sendChat(
        user,
        householdId,
        { text, clientKey: input.clientKey },
        true,
      );
      const intent = await interpretActivity({
        text,
        history: prior.history,
        previous: prior.intent,
        householdName: data.household.name,
        today: data.today,
      });
      reply = prepareActivity(user, data, intent, [...prior.history, text]);
    }
  }
  await inHousehold(user, householdId, async (tx) => {
    await lockChat(tx, householdId);
    await ownedAction(tx, user, householdId, messageId, true);
    await appendChatReply(
      tx,
      householdId,
      action.source.id,
      reply,
      input.cancel ? "system" : "assistant",
    );
  });
  return publicReply(reply);
}
