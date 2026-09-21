"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { ChatComposer } from "./chat-composer";
import { ChatMentionText } from "./chat-mention-text";
import { Blob } from "./blob";
import { ChatBubble } from "./chat-bubble";
import { ActivityDraft } from "./activity-draft";
import { MessageResponse } from "./ai-elements/message";
import {
  activityClarificationGuidance,
  promptPlaceholder,
} from "@/lib/domain/activity-prompts";
import {
  mergeChatMessages,
  nearChatBottom,
  type ChatMessage,
  type ChatPage,
} from "@/lib/domain/chat";
import type { ActivityReply } from "@/lib/domain/activity";

const subscribeToHydration = () => () => {};

type Outbox = { clientKey: string; text: string; failed: boolean };
type Page = ChatPage & { updates: ChatMessage[] };
export function HouseChat({
  householdId,
  householdName,
  viewerId,
  viewerName,
  memberCount,
  timeZone,
  today,
  initial,
  demo = false,
}: {
  householdId: string;
  householdName: string;
  viewerId: string;
  viewerName: string;
  memberCount: number;
  timeZone: string;
  today: string;
  initial: ChatPage;
  demo?: boolean;
}) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [messages, setMessages] = useState(initial.messages);
  const [hasOlder, setHasOlder] = useState(initial.hasMore);
  const [outbox, setOutbox] = useState<Outbox[]>([]);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [older, setOlder] = useState(false);
  const [newMessages, setNewMessages] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [continuation, setContinuation] = useState<string>();
  const [switching, setSwitching] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const current = useRef(messages);
  const stick = useRef(true);
  const mounted = useRef(true);
  const blocked = useRef(false);
  const polling = useRef(false);
  const nextPoll = useRef(0);
  const pollFailures = useRef(0);
  const sending = useRef(new Set<string>());
  const actionLock = useRef(false);
  const clarificationKey = useRef<{
    text: string;
    id: string;
    key: string;
  } | null>(null);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const cursor = useRef(initial.messages.at(-1)?.cursor ?? "0");
  const headers = {
    "Content-Type": "application/json",
    "x-homeshare-household": householdId,
  };
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          headers: {
            "Content-Type": "application/json",
            "x-homeshare-household": householdId,
          },
          body: {
            text: messages
              .at(-1)
              ?.parts.filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(""),
            clientKey: (body as { clientKey?: string } | undefined)?.clientKey,
          },
        }),
      }),
    [householdId],
  );
  const {
    messages: streamedMessages,
    status: streamStatus,
    error: streamError,
    sendMessage,
    setMessages: setStreamMessages,
  } = useChat<UIMessage>({ transport });
  const streamPending =
    streamStatus === "submitted" || streamStatus === "streaming";
  const liveAssistantText = useMemo(() => {
    const message = [...streamedMessages]
      .reverse()
      .find((candidate) => candidate.role === "assistant");
    return message?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
  }, [streamedMessages]);
  useLayoutEffect(() => {
    current.current = messages;
  }, [messages]);
  useEffect(() => {
    mounted.current = true;
    const switchStart = () => {
      blocked.current = true;
      setSwitching(true);
      setContinuation(undefined);
      setText("");
    };
    const switchEnd = () => {
      blocked.current = false;
      setSwitching(false);
    };
    window.addEventListener("homeshare:switch-start", switchStart);
    window.addEventListener("homeshare:switch-end", switchEnd);
    return () => {
      mounted.current = false;
      window.removeEventListener("homeshare:switch-start", switchStart);
      window.removeEventListener("homeshare:switch-end", switchEnd);
    };
  }, []);
  // Keep the composer above the iOS keyboard, using the actual visible viewport.
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const top = panel.current?.getBoundingClientRect().top ?? 0;
      const height =
        (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const keyboard =
        window.innerHeight - (viewport?.height ?? window.innerHeight) > 140;
      panel.current?.style.setProperty(
        "--chat-height",
        `${Math.max(180, height - top - (window.innerWidth < 1024 && !keyboard ? 90 : 12))}px`,
      );
      if (stick.current && scroller.current)
        scroller.current.scrollTop = scroller.current.scrollHeight;
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prepend.current) {
      el.scrollTop =
        prepend.current.top + el.scrollHeight - prepend.current.height;
      prepend.current = null;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, outbox]);
  const poll = useCallback(async () => {
    if (
      demo ||
      polling.current ||
      blocked.current ||
      document.visibilityState !== "visible" ||
      Date.now() < nextPoll.current
    )
      return;
    polling.current = true;
    try {
      const params = new URLSearchParams({ after: cursor.current });
      current.current
        .filter((m) => m.actionable)
        .slice(-100)
        .forEach((m) => params.append("watch", m.id));
      const response = await fetch(`/api/chat?${params}`, {
        headers: { "x-homeshare-household": householdId },
        cache: "no-store",
      });
      if (response.status === 409) {
        blocked.current = true;
        setSwitching(true);
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error();
      const page: Page = await response.json();
      if (
        !mounted.current ||
        blocked.current ||
        page.householdId !== householdId
      )
        return;
      if (page.messages.length) {
        cursor.current = page.messages.at(-1)!.cursor;
        if (!stick.current) setNewMessages(true);
      }
      setMessages((m) =>
        mergeChatMessages(m, [...page.messages, ...page.updates]),
      );
      setOutbox((items) =>
        items.filter(
          (item) => !page.messages.some((m) => m.clientKey === item.clientKey),
        ),
      );
      pollFailures.current = 0;
      nextPoll.current = 0;
      setNotice("");
    } catch {
      pollFailures.current += 1;
      nextPoll.current =
        Date.now() +
        Math.min(60_000, 10_000 * 2 ** Math.min(pollFailures.current, 3));
      if (mounted.current)
        setNotice("Reconnecting… Your conversation is saved.");
    } finally {
      polling.current = false;
    }
  }, [demo, householdId, router]);
  useEffect(() => {
    if (demo) return;
    const initialPoll = window.setTimeout(() => void poll(), 0);
    const timer = window.setInterval(() => void poll(), 10_000);
    const visible = () => void poll();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      clearTimeout(initialPoll);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [demo, poll]);
  async function transmit(item: Outbox) {
    if (
      demo ||
      blocked.current ||
      streamPending ||
      sending.current.has(item.clientKey)
    )
      return;
    sending.current.add(item.clientKey);
    setOutbox((items) =>
      items.map((m) =>
        m.clientKey === item.clientKey ? { ...m, failed: false } : m,
      ),
    );
    try {
      await sendMessage(
        { text: item.text },
        { body: { clientKey: item.clientKey } },
      );
      setStreamMessages([]);
      setOutbox((items) => items.filter((m) => m.clientKey !== item.clientKey));
      // Polling reconciles the streamed response with its durable household
      // message, including proposal data that is intentionally not streamed.
      void poll();
    } catch (error) {
      if (!mounted.current || blocked.current) return;
      setStreamMessages([]);
      setOutbox((items) =>
        items.map((m) =>
          m.clientKey === item.clientKey ? { ...m, failed: true } : m,
        ),
      );
      setNotice(
        error instanceof Error
          ? error.message
          : streamError?.message || "Message could not be sent.",
      );
    } finally {
      sending.current.delete(item.clientKey);
    }
  }
  async function action(
    id: string,
    input: {
      confirm?: boolean;
      cancel?: boolean;
      choice?: number;
      text?: string;
      refresh?: boolean;
    },
  ) {
    if (demo || actionLock.current || blocked.current) return;
    actionLock.current = true;
    setBusy(id);
    setNotice("");
    try {
      const response = await fetch(
        input.confirm ? "/api/activity/confirm" : "/api/activity",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            householdId,
            chatMessageId: id,
            ...(input.confirm ? {} : input),
            ...(input.text
              ? {
                  clientKey: (() => {
                    if (
                      clarificationKey.current?.text !== input.text ||
                      clarificationKey.current.id !== id
                    )
                      clarificationKey.current = {
                        text: input.text!,
                        id,
                        key: crypto.randomUUID(),
                      };
                    return clarificationKey.current.key;
                  })(),
                }
              : {}),
          }),
        },
      );
      const reply: ActivityReply = await response.json();
      if (!response.ok)
        throw new Error(
          reply.message ||
            "Could not update the activity. Retry the same action.",
        );
      if (!mounted.current || blocked.current) return;
      setContinuation(undefined);
      setText("");
      await poll();
      if (reply.kind === "success") router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Connection interrupted. Retry the same confirmation; it won’t record twice.",
      );
    } finally {
      actionLock.current = false;
      setBusy(undefined);
    }
  }
  function send() {
    if (
      !text.trim() ||
      blocked.current ||
      streamPending ||
      (continuation && promptPlaceholder.test(text))
    ) {
      if (continuation && promptPlaceholder.test(text))
        setNotice("Fill in the highlighted details before sending.");
      return;
    }
    if (demo) {
      setNotice(
        "This is a read-only demo. Sign up to message your own household.",
      );
      return;
    }
    if (continuation) {
      void action(continuation, { text });
      return;
    }
    const item = {
      text: text.trim(),
      clientKey: crypto.randomUUID(),
      failed: false,
    };
    stick.current = true;
    setNewMessages(false);
    setText("");
    setNotice("");
    setOutbox((items) => [...items, item]);
    void transmit(item);
    composer.current?.focus();
  }
  function startClarification(id: string, draft?: string) {
    const message = current.current.find((candidate) => candidate.id === id);
    setContinuation(id);
    setText(
      draft ??
        message?.reply?.guidance?.prompts[0]?.text ??
        activityClarificationGuidance.prompts[0].text,
    );
    requestAnimationFrame(() => composer.current?.focus());
  }
  const continuationMessage = continuation
    ? messages.find((message) => message.id === continuation)
    : undefined;
  async function loadOlder() {
    if (demo || older || !messages.length) return;
    setOlder(true);
    try {
      const response = await fetch(`/api/chat?before=${messages[0].cursor}`, {
        headers,
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const page: Page = await response.json();
      if (
        !mounted.current ||
        blocked.current ||
        page.householdId !== householdId
      )
        return;
      if (scroller.current)
        prepend.current = {
          height: scroller.current.scrollHeight,
          top: scroller.current.scrollTop,
        };
      setMessages((m) => mergeChatMessages(m, page.messages));
      setHasOlder(page.hasMore);
    } catch {
      setNotice("Couldn’t load older messages. Please retry.");
    } finally {
      setOlder(false);
    }
  }
  return (
    <section
      ref={panel}
      aria-label="House Chat"
      className="relative flex h-[var(--chat-height,70dvh)] min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Blob variant="chat" sizes="48px" className="size-12" />
        <div className="min-w-0">
          <h1 className="font-semibold">House Chat</h1>
          <p className="truncate text-xs text-muted-foreground">
            {householdName} · {memberCount}{" "}
            {memberCount === 1 ? "housemate" : "housemates"} + Homeshare
          </p>
        </div>
      </header>
      {switching ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Switching household…
        </div>
      ) : (
        <>
          <div
            ref={scroller}
            role="log"
            aria-label="Household messages"
            aria-live="off"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6"
            onScroll={() => {
              const el = scroller.current!;
              stick.current = nearChatBottom(
                el.scrollTop,
                el.scrollHeight,
                el.clientHeight,
              );
              if (stick.current) setNewMessages(false);
            }}
          >
            {hasOlder && (
              <div className="mb-5 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={older}
                  onClick={() => void loadOlder()}
                >
                  {older ? "Loading…" : "Load older messages"}
                </Button>
              </div>
            )}
            {!messages.length && !outbox.length && (
              <div className="mx-auto flex h-full max-w-xs flex-col items-center justify-center text-center">
                <Blob variant="chat" className="size-32" />
                <h2 className="mt-2 text-xl font-semibold">
                  Everyone on the same page.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  A little space for your home. Say hello, talk bills, or ask
                  @Homeshare what’s due.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Only your current housemates can see this chat. Contributions
                  always need your confirmation.
                </p>
              </div>
            )}
            {messages.map((message, index) => (
              <ChatBubble
                key={message.id}
                m={message}
                previous={messages[index - 1]}
                viewerId={viewerId}
                timeZone={timeZone}
                busy={busy}
                action={action}
                onClarify={(id, draft) => {
                  startClarification(id, draft);
                }}
              />
            ))}
            {outbox.map((item) => (
              <div
                key={item.clientKey}
                className="mt-4 ml-auto max-w-[85%] text-right"
              >
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {viewerName}
                </p>
                <p className="rounded-2xl rounded-br-md bg-primary/75 px-4 py-3 text-left text-sm whitespace-pre-wrap break-words text-primary-foreground">
                  <ChatMentionText text={item.text} appearance="own" />
                </p>
                {item.failed ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void transmit(item)}
                  >
                    Failed to send · Retry
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    Sending…
                  </span>
                )}
              </div>
            ))}
            {liveAssistantText && (
              <div className="mt-5 flex gap-2">
                <div className="w-7 shrink-0 pt-1">
                  <Blob sizes="28px" className="size-7" />
                </div>
                <div className="min-w-0 max-w-[88%] sm:max-w-[75%]">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    Homeshare · AI
                  </p>
                  <div className="rounded-2xl border bg-background px-3.5 py-2.5 text-sm leading-relaxed">
                    <MessageResponse isAnimating={streamPending}>
                      {liveAssistantText}
                    </MessageResponse>
                  </div>
                </div>
              </div>
            )}
            {streamPending && !liveAssistantText && (
              <p className="mt-5 text-xs text-muted-foreground" role="status">
                Homeshare is thinking…
              </p>
            )}
          </div>
          {newMessages && (
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-28 left-1/2 -translate-x-1/2 shadow-md"
              onClick={() => {
                stick.current = true;
                setNewMessages(false);
                scroller.current?.scrollTo({
                  top: scroller.current.scrollHeight,
                });
              }}
            >
              <ArrowDown className="size-3" />
              New messages
            </Button>
          )}
          <div className="z-10 shrink-0 border-t bg-card px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {demo && (
              <p className="mb-3 text-xs text-muted-foreground">
                A read-only demo of life at home.{" "}
                <Link
                  href="/sign-up"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Sign up
                </Link>{" "}
                to start your household’s conversation.
              </p>
            )}
            {notice && (
              <p role="status" className="mb-2 text-xs text-muted-foreground">
                {notice}
              </p>
            )}
            {continuation && (
              <div className="mb-3 space-y-2 rounded-xl bg-muted/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Fill in the activity</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Tap a highlighted detail to enter it. Homeshare uses your
                      message to match the bill and prepare a review.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="-mr-2 -mt-2 shrink-0"
                    onClick={() => {
                      setContinuation(undefined);
                      setText("");
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              {continuation ? (
                <ActivityDraft
                  textareaRef={composer}
                  today={today}
                  disabled={!hydrated || streamPending}
                  placeholder={
                    continuationMessage?.reply?.guidance?.placeholder ??
                    activityClarificationGuidance.placeholder
                  }
                  value={text}
                  onChange={setText}
                  onSend={send}
                />
              ) : (
                <ChatComposer
                  textareaRef={composer}
                  disabled={!hydrated || streamPending}
                  placeholder="Message your home…"
                  value={text}
                  onChange={setText}
                  onSend={send}
                />
              )}
              <Button
                type="submit"
                size="icon"
                className="size-11 shrink-0 rounded-full"
                aria-label="Send message"
                disabled={
                  !hydrated ||
                  streamPending ||
                  !text.trim() ||
                  Boolean(continuation && promptPlaceholder.test(text)) ||
                  Boolean(continuation && busy)
                }
              >
                {busy && continuation ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp />
                )}
              </Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
