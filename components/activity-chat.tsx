"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Paperclip, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActivitySources } from "@/components/activity-sources";
import type { ActivitySource } from "@/lib/domain/activity-sources";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { ActivityDraft } from "@/components/activity-draft";
import {
  ActivityStarters,
  ActivityPromptChoices,
} from "@/components/activity-prompts";
import {
  promptPlaceholder,
  type ActivityPrompt,
} from "@/lib/domain/activity-prompts";
import { Heading, Text } from "@/components/ui/typography";
import { dateLabel, money } from "@/lib/domain/bills";
import type { ActivityReply } from "@/lib/domain/activity";
import type { ActivityMessage } from "@/lib/domain/activity-chat";

const subscribeToHydration = () => () => {};

export function ActivityChat({
  householdId,
  householdName,
  today,
  demo = false,
}: {
  householdId: string;
  householdName: string;
  today: string;
  demo?: boolean;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [sources, setSources] = useState<ActivitySource[]>([]);
  const [sourceEpoch, setSourceEpoch] = useState(0);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<ActivityPrompt>();
  const [input, setInput] = useState("");
  const [reply, setReply] = useState<ActivityReply>();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const token = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ActivityMessage>({
        api: "/api/activity",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            householdId,
            // Only the latest user message travels back. Continuation is a bounded,
            // signed server context, never client-supplied assistant/model messages.
            messages: messages
              .filter((m) => m.role === "user")
              .slice(-1)
              .map((m) => ({
                role: m.role,
                parts: m.parts.filter((p) => p.type === "text"),
              })),
          },
        }),
      }),
    [householdId],
  );
  const { messages, sendMessage, status, error, setMessages, stop } =
    useChat<ActivityMessage>({
      transport,
      onData: (part) => {
        if (part.type !== "data-activity") return;
        setReply(part.data);
        if (part.data.token) token.current = part.data.token;
        requestAnimationFrame(() =>
          result.current?.scrollIntoView({ block: "nearest" }),
        );
      },
    });
  const pending = status === "submitted" || status === "streaming";
  function pick(prompt: ActivityPrompt) {
    setInput(prompt.text);
    setSelectedChoice(prompt.choice !== undefined ? prompt : undefined);
    setNotice("");
    if (reply?.kind === "success") setReply(undefined);
    if (prompt.text.startsWith("Use the attached")) setReferencesOpen(true);
    requestAnimationFrame(() => {
      composer.current?.focus();
      const placeholder = prompt.text.match(promptPlaceholder);
      if (placeholder?.index !== undefined)
        composer.current?.setSelectionRange(
          placeholder.index,
          placeholder.index + placeholder[0].length,
        );
      composer.current?.scrollIntoView({ block: "nearest" });
    });
  }
  function cancel() {
    void stop();
    token.current = undefined;
    setReply(undefined);
    setMessages([]);
    setNotice("Cancelled. Nothing was recorded.");
    setInput("");
    setSelectedChoice(undefined);
    setReferencesOpen(false);
    setSources([]);
    setSourceEpoch((value) => value + 1);
  }
  async function send(text: string, choice?: number) {
    if (!text.trim() || pending || confirming || promptPlaceholder.test(text))
      return;
    if (demo) {
      setNotice(
        "This is a read-only demo. Sign up to record activity in your own home.",
      );
      return;
    }
    choice ??=
      selectedChoice?.text === text ? selectedChoice.choice : undefined;
    setSelectedChoice(undefined);
    const context = token.current;
    setNotice("");
    setReply(undefined);
    setInput("");
    composer.current?.blur();
    await sendMessage({ text }, { body: { token: context, choice, sources } });
  }
  async function confirm() {
    if (demo || !reply?.token || inFlight.current) return;
    inFlight.current = true;
    setConfirming(true);
    setNotice("");
    try {
      const response = await fetch("/api/activity/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, token: reply.token }),
      });
      const next: ActivityReply = await response.json();
      if (next.kind === "error") setNotice(next.message);
      else {
        setReply(next);
        token.current = next.token;
        if (next.kind === "success") {
          setMessages([]);
          setSources([]);
          setReferencesOpen(false);
          setSourceEpoch((value) => value + 1);
          router.refresh();
        }
      }
    } catch {
      setNotice(
        "The connection was interrupted. Retry this same confirmation to check whether it was recorded; it won’t record twice.",
      );
    } finally {
      inFlight.current = false;
      setConfirming(false);
    }
  }
  const p = reply?.proposal;
  return (
    <Card className="min-w-0" aria-label="Household activity chat">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <Heading level={2} className="text-lg">
            Tell Homeshare what happened
          </Heading>
          <Text small muted>
            Record a roommate’s share in {householdName}. You’ll review it
            first.
          </Text>
        </div>
        {!messages.length &&
          (!reply || reply.kind === "success") &&
          (demo ? (
            <ActivityPromptChoices
              prompts={[
                {
                  label: "Record a contribution",
                  text: "I paid $25 toward Internet.",
                },
                {
                  label: "Add a shared bill",
                  text: "Add a $30 household supplies bill due today, split equally. I paid my $10 share.",
                },
                {
                  label: "Record a roommate’s share",
                  text: "Emma paid $30.80 toward Gas.",
                },
              ]}
              disabled={!hydrated}
              onPick={pick}
            />
          ) : (
            <ActivityStarters
              key={sourceEpoch}
              householdId={householdId}
              disabled={!hydrated || pending || confirming}
              onPick={pick}
            />
          ))}
        <div
          className="max-h-64 min-w-0 space-y-3 overflow-y-auto overscroll-contain"
          aria-label="Conversation"
        >
          {messages.slice(-4).map((m) => {
            const text = m.parts
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("");
            if (!text) return null;
            return (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.role === "assistant" ? (
                    <>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Source summary
                      </p>
                      <MessageResponse
                        isAnimating={pending && m.id === messages.at(-1)?.id}
                      >
                        {text}
                      </MessageResponse>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  )}
                </MessageContent>
              </Message>
            );
          })}
        </div>
        <div
          ref={result}
          className="min-w-0 scroll-mb-24 space-y-3"
          aria-live="polite"
          aria-atomic="true"
        >
          {pending && (
            <Text small muted className="flex items-start gap-2">
              <Loader2 className="size-4 motion-safe:animate-spin" />
              Checking your activity…
            </Text>
          )}
          {reply && (
            <Text small className="break-words">
              {reply.message}
            </Text>
          )}
          {!pending &&
            !p &&
            (reply?.choices || reply?.guidance?.prompts.length) && (
              <ActivityPromptChoices
                compact
                disabled={confirming}
                onPick={pick}
                prompts={
                  reply.choices?.map((choice, i) => ({
                    label: choice,
                    text: choice,
                    choice: i,
                  })) ??
                  reply.guidance?.prompts ??
                  []
                }
              />
            )}
          {p && (
            <ActivityConfirmation
              p={p}
              disabled={confirming || pending}
              onConfirm={() => void confirm()}
              onCancel={cancel}
            />
          )}
          {reply?.billUrl && (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={reply.billUrl}>Open bill</Link>
            </Button>
          )}
          {(notice || error) && (
            <Text small role="status" className="break-words">
              {notice ||
                "Connection interrupted. Please try your message again. No activity is recorded until you confirm."}
            </Text>
          )}
        </div>
        {!p && (
          <form
            className="flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <ActivityDraft
              textareaRef={composer}
              today={today}
              placeholder={
                reply?.guidance?.placeholder ??
                (reply?.choices
                  ? "Choose an option above, or clarify…"
                  : "Tell me what happened…")
              }
              value={input}
              onChange={(value) => {
                setInput(value);
                setSelectedChoice(undefined);
              }}
              onSend={() => void send(input)}
              disabled={!hydrated || pending || confirming}
            />
            <Button
              type="submit"
              size="icon"
              className="size-12 shrink-0"
              disabled={
                !hydrated ||
                pending ||
                confirming ||
                !input.trim() ||
                promptPlaceholder.test(input)
              }
              aria-label="Send activity"
            >
              <ArrowUp />
            </Button>
          </form>
        )}
        {demo && (
          <Text small muted>
            Explore a read-only demo.{" "}
            <Link
              href="/sign-up"
              className="font-medium text-primary underline underline-offset-4"
            >
              Sign up
            </Link>{" "}
            to chat and record activity with your household.
          </Text>
        )}
        {!p && !demo && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 text-muted-foreground"
              aria-expanded={referencesOpen}
              aria-controls="activity-references"
              disabled={pending || confirming}
              onClick={() => setReferencesOpen(!referencesOpen)}
            >
              <Paperclip className="size-4" />{" "}
              {sources.length
                ? `${sources.length} attached ${sources.length === 1 ? "source" : "sources"}`
                : "Add a bill or source"}{" "}
              <ChevronDown className="size-3" />
            </Button>
            <div id="activity-references" hidden={!referencesOpen}>
              <ActivitySources
                key={sourceEpoch}
                householdId={householdId}
                sources={sources}
                onChange={setSources}
                disabled={!hydrated || pending || confirming}
              />
            </div>
          </div>
        )}
        {!p && (pending || messages.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            disabled={confirming}
            onClick={cancel}
          >
            Cancel activity
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Shared by the persistent household conversation and the existing activity UI.
export function ActivityConfirmation({
  p,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  p: NonNullable<ActivityReply["proposal"]>;
  disabled?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div
      className="space-y-3 rounded-xl border bg-background/70 p-4"
      data-testid="activity-proposal"
    >
      <div>
        <Text className="break-words font-medium">
          {p.kind === "new" ? "Create " : ""}
          {p.name}
        </Text>
        <Text small muted>
          Due {dateLabel(p.dueDate, true)} · {money(p.totalCents)}
        </Text>
      </div>
      {p.kind === "new" && (
        <div className="space-y-1">
          {p.allocations.map((a, i) => (
            <div key={i} className="flex justify-between gap-4 text-sm">
              <span className="min-w-0 break-words">{a.name}</span>
              <span className="shrink-0 tabular-nums">
                {money(a.amountCents)}
              </span>
            </div>
          ))}
          <Text small muted>
            Split equally across all current roommates.
          </Text>
        </div>
      )}
      <Text small className="break-words font-medium">
        {p.payerName} · Contribution: {money(p.amountCents)}
      </Text>
      <Text small muted>
        Current share: {money(p.shareCents)} · Already paid:{" "}
        {money(p.paidCents)}
        <br />
        Remaining after: {money(p.remainingCents)}
      </Text>
      {onConfirm && (
        <div className="flex flex-wrap gap-2">
          <Button
            className="min-h-11 flex-1"
            disabled={disabled}
            onClick={onConfirm}
          >
            {disabled ? "Please wait…" : "Confirm"}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
