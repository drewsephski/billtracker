"use client";
import { useId, useRef, useState, type RefObject } from "react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Blob } from "./blob";
import { ChatMentionText } from "./chat-mention-text";
import {
  insertHomeshareMention,
  mentionQuery,
} from "@/lib/domain/chat-mentions";

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  textareaRef,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  const paint = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState("");
  const query = mentionQuery(value, caret);
  const open =
    focused && !disabled && Boolean(query) && dismissed !== `${value}|${caret}`;
  function choose() {
    if (!query) return;
    const next = insertHomeshareMention(value, query);
    if (next.text.length > 1000) return;
    onChange(next.text);
    setCaret(next.caret);
    setDismissed(`${next.text}|${next.caret}`);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caret, next.caret);
    });
  }
  return (
    <div className="relative min-w-0 flex-1">
      {open && (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label="Mention a participant"
          className="absolute inset-x-0 bottom-[calc(100%+.5rem)] z-20 overflow-hidden rounded-2xl border bg-popover p-1.5 shadow-lg"
        >
          <Button
            id={`${id}-homeshare`}
            type="button"
            role="option"
            aria-selected="true"
            variant="ghost"
            className="h-auto min-h-14 w-full justify-start gap-3 rounded-xl bg-primary/5 px-3 py-2 text-left"
            onPointerDown={(e) => e.preventDefault()}
            onClick={choose}
          >
            <Blob variant="chat" sizes="36px" className="size-9 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-primary">
                Homeshare{" "}
                <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                  AI
                </span>
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                Ask about bills or record a contribution
              </span>
            </span>
            <kbd className="hidden rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
              Tab ↵
            </kbd>
          </Button>
        </div>
      )}
      {/* Native textarea retains selection, IME, undo and mobile keyboard behavior.
        This identically sized paint layer colors mentions without changing text. */}
      <div
        aria-hidden="true"
        data-testid="chat-composer-highlight"
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
      >
        <div
          ref={paint}
          className="border border-transparent px-2.5 py-2 text-base leading-6 whitespace-pre-wrap break-words text-foreground [overflow-wrap:anywhere]"
        >
          <ChatMentionText text={value} appearance="composer" />
          {value.endsWith("\n") ? "\u200b" : null}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        disabled={disabled}
        role="combobox"
        aria-label="Message your household"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-homeshare` : undefined}
        placeholder={placeholder}
        value={value}
        maxLength={1000}
        rows={1}
        className="min-h-11 max-h-32 resize-none rounded-2xl bg-background text-base leading-6 text-transparent caret-foreground md:text-base dark:bg-background [-webkit-text-fill-color:transparent] placeholder:[-webkit-text-fill-color:var(--muted-foreground)]"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onScroll={(e) => {
          if (paint.current)
            paint.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            return;
          }
          if (open && (e.key === "Tab" || e.key === "Enter") && !e.shiftKey) {
            e.preventDefault();
            choose();
            return;
          }
          if (open && e.key === "Escape") {
            e.preventDefault();
            setDismissed(`${value}|${caret}`);
            return;
          }
          if (
            e.key === "Enter" &&
            !e.shiftKey &&
            window.matchMedia("(pointer: fine)").matches
          ) {
            e.preventDefault();
            onSend();
          }
        }}
      />
    </div>
  );
}
