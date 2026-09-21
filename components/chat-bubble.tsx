"use client";
import Link from "next/link";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { Blob } from "./blob";
import { ActivityConfirmation } from "./activity-chat";
import type { ChatMessage } from "@/lib/domain/chat";
export type ChatActivityAction = {
  confirm?: boolean;
  cancel?: boolean;
  choice?: number;
  text?: string;
  refresh?: boolean;
};
export function ChatBubble({
  m,
  previous,
  viewerId,
  timeZone,
  busy,
  action,
  onClarify,
}: {
  m: ChatMessage;
  previous?: ChatMessage;
  viewerId: string;
  timeZone: string;
  busy?: string;
  action: (id: string, input: ChatActivityAction) => Promise<void>;
  onClarify: (id: string) => void;
}) {
  const day = (date: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  const dateBreak = !previous || day(previous.createdAt) !== day(m.createdAt);
  const mine = m.senderId === viewerId;
  const ai = m.kind !== "human";
  const grouped =
    !dateBreak &&
    previous?.senderId === m.senderId &&
    previous?.kind === m.kind &&
    new Date(m.createdAt).getTime() - new Date(previous.createdAt).getTime() <
      300_000;
  const canAct = m.actionable && m.replyOwner === viewerId;
  return (
    <div data-message-id={m.id}>
      {dateBreak && (
        <div className="my-5 text-center text-[11px] text-muted-foreground">
          {day(m.createdAt)}
        </div>
      )}
      <div
        className={`flex gap-2 ${grouped ? "mt-1" : "mt-5"} ${mine ? "justify-end" : "justify-start"}`}
      >
        {!mine && (
          <div className="w-7 shrink-0 pt-1">
            {!grouped &&
              (ai ? (
                <Blob sizes="28px" className="size-7" />
              ) : (
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">
                    {m.senderName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
              ))}
          </div>
        )}
        <div className="min-w-0 max-w-[88%] sm:max-w-[75%]">
          {!grouped && (
            <p
              className={`mb-1 text-[11px] text-muted-foreground ${mine ? "text-right" : ""}`}
            >
              {mine ? "You" : m.senderName}
              {ai && " · AI"}
            </p>
          )}
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${mine ? "rounded-br-md bg-primary text-primary-foreground" : ai ? "border bg-background" : "rounded-bl-md bg-secondary"}`}
          >
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {m.text}
            </p>
            {m.reply?.proposal && (
              <div className="mt-3">
                <ActivityConfirmation
                  p={m.reply.proposal}
                  disabled={busy === m.id}
                  onConfirm={
                    canAct
                      ? () => void action(m.id, { confirm: true })
                      : undefined
                  }
                  onCancel={
                    canAct
                      ? () => void action(m.id, { cancel: true })
                      : undefined
                  }
                />
              </div>
            )}
            {canAct && m.reply?.proposal && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === m.id}
                onClick={() => void action(m.id, { refresh: true })}
              >
                Refresh proposal
              </Button>
            )}
            {m.actionable && !canAct && (
              <p className="mt-2 text-xs text-muted-foreground">
                Waiting for the sender to review.
              </p>
            )}
            {canAct && m.reply?.kind === "clarification" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.reply.choices?.map((choice, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant="outline"
                    disabled={busy === m.id}
                    onClick={() => void action(m.id, { choice: i })}
                  >
                    {choice}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === m.id}
                  onClick={() => {
                    onClarify(m.id);
                  }}
                >
                  Clarify activity
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === m.id}
                  onClick={() => void action(m.id, { cancel: true })}
                >
                  Cancel
                </Button>
              </div>
            )}
            {m.reply?.billUrl && (
              <Link
                className="mt-2 inline-block font-medium underline underline-offset-4"
                href={m.reply.billUrl}
              >
                Open bill
              </Link>
            )}
          </div>
          <time
            dateTime={m.createdAt}
            className={`mt-1 block text-[10px] text-muted-foreground ${mine ? "text-right" : ""}`}
          >
            {new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone,
            }).format(new Date(m.createdAt))}
          </time>
        </div>
      </div>
    </div>
  );
}
