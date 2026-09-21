import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { chatMessages, chatJobs } from "@/lib/db/schema";
import type { Transaction } from "@/lib/db";
import {
  chatSendSchema,
  directlyAddressesHomeshare,
  type ChatMessage,
} from "@/lib/domain/chat";
import type { ActivityReply } from "@/lib/domain/activity";
import { DomainError } from "@/lib/domain/bills";
import type { Identity } from "./auth";
import { inHousehold } from "./households";
import { readHousehold } from "./queries";
import { interpretActivity } from "./activity-interpreter";
import { prepareActivity } from "./activity";
import { triageChat, answerChat } from "./chat-ai";

export async function lockChat(tx: Transaction, householdId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`chat:${householdId}`}, 0))`,
  );
}
export function publicReply(
  reply: ActivityReply,
): Omit<ActivityReply, "token"> {
  const { token: _token, ...safe } = reply;
  void _token;
  return safe;
}
function view(
  row: typeof chatMessages.$inferSelect,
  activeId?: string | null,
  replyOwner: string | null = null,
): ChatMessage {
  return {
    id: row.id,
    cursor: String(row.sequence),
    clientKey: row.clientKey,
    kind: row.kind,
    senderId: row.senderId,
    senderName: row.senderName,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    sourceId: row.sourceId,
    reply: row.reply ? publicReply(row.reply) : null,
    replyOwner,
    actionable: activeId === row.id,
  };
}
export async function listChat(
  user: Identity,
  householdId: string,
  options: { before?: string; after?: string; watch?: string[] } = {},
) {
  return inHousehold(user, householdId, async (tx) => {
    const predicate = and(
      eq(chatMessages.householdId, householdId),
      options.before
        ? lt(chatMessages.sequence, Number(options.before))
        : undefined,
      options.after
        ? gt(chatMessages.sequence, Number(options.after))
        : undefined,
    );
    const rows = await tx
      .select({ message: chatMessages, active: chatJobs.activeMessageId })
      .from(chatMessages)
      .leftJoin(
        chatJobs,
        and(
          eq(chatJobs.sourceId, chatMessages.sourceId),
          eq(chatJobs.householdId, householdId),
        ),
      )
      .where(predicate)
      .orderBy(
        options.after
          ? asc(chatMessages.sequence)
          : desc(chatMessages.sequence),
      )
      .limit(41);
    const sourceIds = rows
      .map((r) => r.message.sourceId)
      .filter((id): id is string => Boolean(id));
    const sources = sourceIds.length
      ? await tx
          .select({ id: chatMessages.id, senderId: chatMessages.senderId })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.householdId, householdId),
              inArray(chatMessages.id, sourceIds),
            ),
          )
      : [];
    const owner = (sourceId: string | null) =>
      sources.find((s) => s.id === sourceId)?.senderId ?? null;
    const page = rows.slice(0, 40);
    if (!options.after) page.reverse();
    const watched = options.watch?.length
      ? await tx
          .select({ message: chatMessages, active: chatJobs.activeMessageId })
          .from(chatMessages)
          .leftJoin(
            chatJobs,
            and(
              eq(chatJobs.sourceId, chatMessages.sourceId),
              eq(chatJobs.householdId, householdId),
            ),
          )
          .where(
            and(
              eq(chatMessages.householdId, householdId),
              inArray(chatMessages.id, options.watch.slice(0, 100)),
            ),
          )
      : [];
    const watchedSources = watched
      .map((r) => r.message.sourceId)
      .filter((id): id is string => Boolean(id));
    if (watchedSources.length)
      sources.push(
        ...(await tx
          .select({ id: chatMessages.id, senderId: chatMessages.senderId })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.householdId, householdId),
              inArray(chatMessages.id, watchedSources),
            ),
          )),
      );
    return {
      householdId,
      messages: page.map((r) =>
        view(r.message, r.active, owner(r.message.sourceId)),
      ),
      updates: watched.map((r) =>
        view(r.message, r.active, owner(r.message.sourceId)),
      ),
      hasMore: rows.length > 40,
    };
  });
}
export async function sendChat(
  user: Identity,
  householdId: string,
  raw: unknown,
  skipTriage = false,
) {
  const input = chatSendSchema.parse(raw);
  return inHousehold(user, householdId, async (tx, actor) => {
    await lockChat(tx, householdId);
    const [existing] = await tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.householdId, householdId),
          eq(chatMessages.clientKey, input.clientKey),
          eq(chatMessages.kind, "human"),
        ),
      );
    if (existing) {
      if (existing.senderId !== actor.id || existing.text !== input.text)
        throw new DomainError(
          "That send key is already in use. Please start a new message.",
        );
      return view(existing);
    }
    const [rate] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.householdId, householdId),
          eq(chatMessages.senderId, actor.id),
          gt(chatMessages.createdAt, new Date(Date.now() - 60_000)),
        ),
      );
    if (rate.count >= 30)
      throw new DomainError(
        "A little too fast. Please wait a minute and retry.",
      );
    const [row] = await tx
      .insert(chatMessages)
      .values({
        householdId,
        senderId: actor.id,
        senderName: user.name,
        kind: "human",
        text: input.text,
        clientKey: input.clientKey,
        createdAt: new Date(),
      })
      .returning();
    await tx.insert(chatJobs).values({
      householdId,
      sourceId: row.id,
      state: skipTriage ? "done" : "queued",
    });
    return view(row);
  });
}
export async function appendChatReply(
  tx: Transaction,
  householdId: string,
  sourceId: string,
  reply: ActivityReply | string,
  kind: "assistant" | "system" = "assistant",
  clientKey: string = randomUUID(),
) {
  await lockChat(tx, householdId);
  const [row] = await tx
    .insert(chatMessages)
    .values({
      householdId,
      sourceId,
      kind,
      senderName: "Homeshare",
      text: typeof reply === "string" ? reply : reply.message,
      reply: typeof reply === "string" ? null : publicReply(reply),
      clientKey,
      createdAt: new Date(),
    })
    .returning();
  await tx
    .update(chatJobs)
    .set({
      state: "done",
      leaseId: null,
      leaseUntil: null,
      token: typeof reply === "string" ? null : (reply.token ?? null),
      activeMessageId: typeof reply !== "string" && reply.token ? row.id : null,
    })
    .where(
      and(
        eq(chatJobs.householdId, householdId),
        eq(chatJobs.sourceId, sourceId),
      ),
    );
  return row;
}
// Short database lease around bounded provider calls; no long-lived DB transaction.
// Recovery uses the original sender's authenticated session only.
export async function processChat(
  user: Identity,
  householdId: string,
  sourceId: string,
) {
  const lease = randomUUID();
  const source = await inHousehold(user, householdId, async (tx, actor) => {
    const [message] = await tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, sourceId),
          eq(chatMessages.householdId, householdId),
          eq(chatMessages.senderId, actor.id),
        ),
      );
    if (!message) return;
    const [job] = await tx
      .update(chatJobs)
      .set({
        state: "processing",
        leaseId: lease,
        leaseUntil: new Date(Date.now() + 100_000),
        attempts: sql`${chatJobs.attempts} + 1`,
      })
      .where(
        and(
          eq(chatJobs.sourceId, sourceId),
          eq(chatJobs.householdId, householdId),
          or(
            eq(chatJobs.state, "queued"),
            and(
              eq(chatJobs.state, "processing"),
              lt(chatJobs.leaseUntil, new Date()),
            ),
          ),
        ),
      )
      .returning();
    return job ? { message, attempts: job.attempts } : undefined;
  });
  if (!source) return;
  let reply: ActivityReply | string | undefined;
  let engaged = directlyAddressesHomeshare(source.message.text);
  try {
    if (source.attempts > 3) throw new Error("Processing interrupted");
    const mode = await triageChat(source.message.text);
    if (mode !== "silent") {
      engaged = true;
      const data = await readHousehold(user, householdId);
      if (mode === "activity") {
        // No roommate history enters extraction. "I" is always the source author.
        const intent = await interpretActivity({
          text: source.message.text,
          history: [],
          householdName: data.household.name,
          today: data.today,
        });
        reply = prepareActivity(user, data, intent, [source.message.text]);
      } else {
        const recent = await listChat(user, householdId, {
          before: String(source.message.sequence),
        });
        reply = await answerChat(
          source.message.text,
          recent.messages.map((m) => ({ name: m.senderName, text: m.text })),
          data,
        );
      }
    }
  } catch {
    if (engaged)
      reply =
        "Homeshare is temporarily unavailable. Your message is saved. Ask me again shortly, or record your share from Bills.";
  }
  await inHousehold(user, householdId, async (tx) => {
    await lockChat(tx, householdId);
    const [job] = await tx
      .select()
      .from(chatJobs)
      .where(
        and(
          eq(chatJobs.sourceId, sourceId),
          eq(chatJobs.householdId, householdId),
        ),
      )
      .for("update");
    if (job?.leaseId !== lease || job.state !== "processing") return;
    if (reply)
      await appendChatReply(
        tx,
        householdId,
        sourceId,
        reply,
        "assistant",
        sourceId,
      );
    else
      await tx
        .update(chatJobs)
        .set({ state: "done", leaseId: null, leaseUntil: null })
        .where(
          and(
            eq(chatJobs.sourceId, sourceId),
            eq(chatJobs.householdId, householdId),
          ),
        );
  });
}
export async function recoverChat(user: Identity, householdId: string) {
  const pending = await inHousehold(user, householdId, async (tx, actor) =>
    tx
      .select({ id: chatJobs.sourceId })
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
          eq(chatMessages.senderId, actor.id),
          or(
            eq(chatJobs.state, "queued"),
            and(
              eq(chatJobs.state, "processing"),
              lt(chatJobs.leaseUntil, new Date()),
            ),
          ),
        ),
      )
      .limit(2),
  );
  await Promise.all(pending.map((m) => processChat(user, householdId, m.id)));
}
