"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Paperclip, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  demoActivityPrompts,
  demoActivityReply,
  type DemoActivityKey,
} from "@/lib/demo-activity";

const subscribeToHydration = () => () => {};
const demoKeyByLabel: Record<string, DemoActivityKey> = {
  "Record my contribution": "own-share",
  "Set up a shared bill": "new-bill",
  "Record Emma’s contribution": "roommate-share",
};

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
  const [demoKey, setDemoKey] = useState<DemoActivityKey>();
  const [demoStreaming, setDemoStreaming] = useState(false);
  const token = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const demoStreamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const activityPending = pending || demoStreaming;
  useEffect(
    () => () => {
      if (demoStreamTimer.current) clearTimeout(demoStreamTimer.current);
    },
    [],
  );
  function stopDemoStream() {
    if (demoStreamTimer.current) clearTimeout(demoStreamTimer.current);
    demoStreamTimer.current = null;
    setDemoStreaming(false);
  }
  function pick(prompt: ActivityPrompt) {
    setInput(prompt.text);
    setSelectedChoice(prompt.choice !== undefined ? prompt : undefined);
    if (demo) setDemoKey(demoKeyByLabel[prompt.label]);
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
    stopDemoStream();
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
  function resetDemo() {
    stopDemoStream();
    setMessages([]);
    setReply(undefined);
    setInput("");
    setDemoKey(undefined);
    setNotice("");
  }
  function inferDemoKey(text: string): DemoActivityKey | undefined {
    const normalized = text.toLocaleLowerCase();
    if (normalized.includes("emma") && normalized.includes("gas"))
      return "roommate-share";
    if (normalized.includes("internet")) return "own-share";
    if (normalized.includes("bill")) return "new-bill";
    return undefined;
  }
  async function send(text: string, choice?: number) {
    if (
      !text.trim() ||
      activityPending ||
      confirming ||
      promptPlaceholder.test(text)
    )
      return;
    if (demo) {
      const key = demoKey ?? inferDemoKey(text);
      if (!key) {
        setNotice("Pick a sample request to preview Homeshare’s review flow.");
        return;
      }
      const preview = demoActivityReply(key, today);
      const stamp = Date.now();
      const previewMessages: ActivityMessage[] = [
        {
          id: `demo-activity-user-${stamp}`,
          role: "user",
          parts: [{ type: "text", text }],
        },
        {
          id: `demo-activity-assistant-${stamp}`,
          role: "assistant",
          parts: [{ type: "text", text: "" }],
        },
      ];
      setMessages(previewMessages);
      setReply(undefined);
      setInput("");
      setDemoKey(undefined);
      setNotice("");
      setDemoStreaming(true);
      let cursor = 0;
      const stream = () => {
        cursor = Math.min(cursor + 2, preview.message.length);
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1
              ? {
                  ...message,
                  parts: [
                    {
                      type: "text" as const,
                      text: preview.message.slice(0, cursor),
                    },
                  ],
                }
              : message,
          ),
        );
        if (cursor >= preview.message.length) {
          demoStreamTimer.current = null;
          setDemoStreaming(false);
          setReply(preview);
          return;
        }
        demoStreamTimer.current = setTimeout(stream, 24);
      };
      demoStreamTimer.current = setTimeout(stream, 80);
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
  const assistantTexts = new Set(
    messages
      .filter((message) => message.role === "assistant")
      .map((message) =>
        message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
      ),
  );
  return (
    <Card className="min-w-0" aria-label="Household activity chat">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={2} className="text-lg">
              {demo
                ? "See how Homeshare sorts it out"
                : "Tell Homeshare what happened"}
            </Heading>
            {demo && <Badge variant="outline">Interactive preview</Badge>}
          </div>
          <Text small muted>
            {demo
              ? "Pick a real household request. Homeshare checks the bill, calculates the share, and shows you what would be recorded."
              : `Record a roommate’s share in ${householdName}. You’ll review it first.`}
          </Text>
        </div>
        {!messages.length &&
          (!reply || reply.kind === "success") &&
          (demo ? (
            <ActivityPromptChoices
              prompts={[...demoActivityPrompts]}
              disabled={!hydrated}
              onPick={pick}
            />
          ) : (
            <ActivityStarters
              key={sourceEpoch}
              householdId={householdId}
              disabled={!hydrated || activityPending || confirming}
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
                        isAnimating={
                          activityPending && m.id === messages.at(-1)?.id
                        }
                      >
                        {text}
                      </MessageResponse>
                      {demoStreaming && m.id === messages.at(-1)?.id && (
                        <span
                          aria-hidden
                          className="mt-1 inline-block h-4 w-0.5 bg-primary motion-safe:animate-pulse"
                        />
                      )}
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
          {activityPending && (
            <Text small muted className="flex items-start gap-2">
              <Loader2 className="size-4 motion-safe:animate-spin" />
              {demoStreaming
                ? "Homeshare is checking the household…"
                : "Checking your activity…"}
            </Text>
          )}
          {reply && !assistantTexts.has(reply.message) && (
            <Text small className="break-words">
              {reply.message}
            </Text>
          )}
          {!activityPending &&
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
              disabled={confirming || activityPending || demo}
              onConfirm={demo ? undefined : () => void confirm()}
              onCancel={demo ? resetDemo : cancel}
            />
          )}
          {demo && p && (
            <div className="space-y-2 rounded-xl bg-secondary/55 p-4">
              <Text small className="font-medium">
                Ready to make this real?
              </Text>
              <Text small muted>
                This preview uses the same review step, equal-split math, and
                share checks as a real household.
              </Text>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild className="min-h-11">
                  <Link href="/sign-up">Create my household</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={resetDemo}
                >
                  Try another request
                </Button>
              </div>
            </div>
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
              disabled={!hydrated || activityPending || confirming}
            />
            <Button
              type="submit"
              size="icon"
              className="size-12 shrink-0"
              disabled={
                !hydrated ||
                activityPending ||
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
            Preview only — nothing is saved.{" "}
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
              disabled={activityPending || confirming}
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
                disabled={!hydrated || activityPending || confirming}
              />
            </div>
          </div>
        )}
        {!p && (activityPending || messages.length > 0) && (
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
