"use client";

import { useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { dateLabel, parseMoney } from "@/lib/domain/bills";
import {
  draftPlaceholders,
  placeholderLabels,
  replaceDraftPlaceholder,
} from "@/lib/domain/activity-prompts";

export function ActivityDraft({
  value,
  onChange,
  onSend,
  placeholder,
  disabled,
  today,
  textareaRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled: boolean;
  today: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const mirror = useRef<HTMLDivElement>(null);
  const returnToDraft = useRef(false);
  const fields = draftPlaceholders(value);
  const [editor, setEditor] = useState<string>();
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState("");
  function replace(field: (typeof fields)[number], text: string) {
    const next = replaceDraftPlaceholder(value, field.start, field.token, text);
    returnToDraft.current = true;
    onChange(next);
    setEditor(undefined);
    setError("");
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const nextField = draftPlaceholders(next)[0];
      const start = nextField?.start ?? field.start + text.length;
      textareaRef.current?.setSelectionRange(start, nextField?.end ?? start);
    });
  }
  function apply(field: (typeof fields)[number]) {
    const text = replacement.trim();
    if (!text) return;
    if (["[total]", "[amount]", "[contribution]"].includes(field.token)) {
      try {
        if (parseMoney(text) <= 0) throw new Error();
      } catch {
        setError("Use a positive amount with up to 2 decimal places.");
        return;
      }
    }
    replace(field, text);
  }
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="relative rounded-lg bg-background">
        {/* Only highlight backgrounds are painted. The native textarea owns
            text, selection, input, accessibility and the mobile keyboard. */}
        <div
          ref={mirror}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 text-base leading-6 whitespace-pre-wrap text-transparent [overflow-wrap:anywhere]"
        >
          {value
            .split(
              /(\[(?:contribution|total|due date|YYYY-MM-DD|amount|bill|name)\])/,
            )
            .map((part, i) =>
              placeholderLabels[part] ? (
                <mark
                  key={i}
                  className="rounded-sm bg-primary/25 text-transparent"
                >
                  {part}
                </mark>
              ) : (
                part
              ),
            )}
          {"\n"}
        </div>
        <Textarea
          ref={textareaRef}
          aria-label="Describe bill activity"
          aria-describedby={fields.length ? "activity-draft-help" : undefined}
          placeholder={placeholder}
          value={value}
          maxLength={1000}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            const input = event.currentTarget;
            if (input.selectionStart !== input.selectionEnd) return;
            const field = fields.find(
              (f) =>
                input.selectionStart >= f.start && input.selectionStart < f.end,
            );
            if (field) input.setSelectionRange(field.start, field.end);
          }}
          onScroll={(event) => {
            if (mirror.current)
              mirror.current.scrollTop = event.currentTarget.scrollTop;
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={2}
          disabled={disabled}
          enterKeyHint="send"
          autoComplete="off"
          className="relative max-h-40 min-h-16 min-w-0 resize-none bg-transparent text-base leading-6 [overflow-wrap:anywhere] md:text-base dark:bg-transparent"
        />
      </div>
      {fields.length > 0 && (
        <div className="space-y-1.5">
          <p id="activity-draft-help" className="text-xs text-muted-foreground">
            Tap a highlighted detail to replace it, or fill it in below.
          </p>
          <div
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Fill in draft details"
          >
            {fields.map((field) => {
              const key = `${field.start}:${field.token}`;
              const label = placeholderLabels[field.token];
              if (["[due date]", "[YYYY-MM-DD]"].includes(field.token))
                return (
                  <DatePicker
                    key={key}
                    id={`activity-due-date-${field.start}`}
                    name="activityDraftDueDate"
                    defaultValue=""
                    value=""
                    today={today}
                    disabled={disabled}
                    placeholder="Choose due date"
                    className="h-auto min-h-9 gap-2 rounded-lg px-2.5 py-1.5 text-xs pointer-coarse:min-h-11"
                    onValueChange={(date) =>
                      replace(field, dateLabel(date, true))
                    }
                  />
                );
              return (
                <Popover
                  key={key}
                  open={editor === key}
                  onOpenChange={(open) => {
                    returnToDraft.current = false;
                    setEditor(open ? key : undefined);
                    setReplacement("");
                    setError("");
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      className="h-auto min-h-9 rounded-lg px-2.5 py-1.5 text-xs pointer-coarse:min-h-11"
                    >
                      {label}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    collisionPadding={12}
                    className="w-[min(18rem,calc(100vw-1.5rem))] space-y-2 p-3"
                    onCloseAutoFocus={(event) => {
                      if (returnToDraft.current) event.preventDefault();
                    }}
                  >
                    <label
                      htmlFor="activity-draft-field"
                      className="text-sm font-medium"
                    >
                      {label}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="activity-draft-field"
                        value={replacement}
                        maxLength={100}
                        inputMode={
                          ["[total]", "[amount]", "[contribution]"].includes(
                            field.token,
                          )
                            ? "decimal"
                            : "text"
                        }
                        onChange={(event) => {
                          setReplacement(event.target.value);
                          setError("");
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            apply(field);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        disabled={!replacement.trim()}
                        onClick={() => apply(field)}
                      >
                        Apply
                      </Button>
                    </div>
                    {error && (
                      <p role="alert" className="text-xs text-destructive">
                        {error}
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
