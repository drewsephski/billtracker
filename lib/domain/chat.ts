import { z } from "zod";
import type { ActivityReply } from "./activity";
export const chatSendSchema = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  clientKey: z.uuid(),
});
export const chatCursorSchema = z.string().regex(/^[0-9]{1,15}$/);
export type ChatMessage = {
  id: string;
  cursor: string;
  clientKey: string;
  kind: "human" | "assistant" | "system";
  senderId: string | null;
  senderName: string;
  text: string;
  createdAt: string;
  sourceId: string | null;
  reply: Omit<ActivityReply, "token"> | null;
  actionable: boolean;
  replyOwner: string | null;
};
export type ChatPage = {
  messages: ChatMessage[];
  hasMore: boolean;
  householdId: string;
};
export function directlyAddressesHomeshare(text: string) {
  return /\bHomeshare\b/i.test(text);
}
export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
) {
  const messages = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) messages.set(m.id, m);
  return [...messages.values()].sort(
    (a, b) => Number(a.cursor) - Number(b.cursor),
  );
}
export function nearChatBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
) {
  return scrollHeight - scrollTop - clientHeight < 100;
}
