"use client";

import { Fragment, useRef, useState, type RefObject } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePickerCalendar } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { dateLabel, parseMoney } from "@/lib/domain/bills";
import {
  draftPlaceholders,
  placeholderLabels,
  replaceDraftPlaceholder,
} from "@/lib/domain/activity-prompts";

type DraftField = ReturnType<typeof draftPlaceholders>[number];
const isDate = (field: DraftField) =>
  ["[due date]", "[YYYY-MM-DD]"].includes(field.token);

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
  const editorInput = useRef<HTMLInputElement>(null);
  const anchor = useRef({ getBoundingClientRect: () => new DOMRect() });
  const focusReturn = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);
  const focusRequest = useRef(0);
  const editorOpen = useRef(false);
  const fields = draftPlaceholders(value);
  const [editor, setEditor] = useState<DraftField>();
  const field = fields.find(
    (f) => f.start === editor?.start && f.token === editor.token,
  );
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState("");

  function fieldAtPoint(x: number, y: number) {
    for (const current of fields) {
      const mark = mirror.current?.querySelector<HTMLElement>(
        `[data-placeholder-start="${current.start}"]`,
      );
      if (!mark) continue;
      const fragment = Array.from(mark.getClientRects()).findIndex(
        (rect) =>
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom,
      );
      if (fragment >= 0) return { field: current, mark, fragment };
    }
  }
  function openEditor(
    next: DraftField,
    mark: HTMLElement,
    fragment: number,
    trigger: HTMLElement,
  ) {
    if (disabled) return;
    // Use the clicked line fragment, not the bounding box of a wrapped token.
    // Radix remeasures this live as the textarea or viewport moves.
    anchor.current = {
      getBoundingClientRect: () =>
        mark.getClientRects()[fragment] ?? mark.getBoundingClientRect(),
    };
    focusReturn.current = trigger;
    restoreFocus.current = true;
    setReplacement("");
    setError("");
    editorOpen.current = true;
    const request = ++focusRequest.current;
    setEditor(next);
    requestAnimationFrame(() => {
      if (request === focusRequest.current) editorInput.current?.focus();
    });
  }
  function replace(current: DraftField, text: string) {
    const next = replaceDraftPlaceholder(
      value,
      current.start,
      current.token,
      text,
    );
    restoreFocus.current = false;
    editorOpen.current = false;
    const request = ++focusRequest.current;
    onChange(next);
    setEditor(undefined);
    setError("");
    requestAnimationFrame(() => {
      if (request !== focusRequest.current) return;
      textareaRef.current?.focus();
      const nextField = draftPlaceholders(next)[0];
      const start = nextField?.start ?? current.start + text.length;
      textareaRef.current?.setSelectionRange(start, nextField?.end ?? start);
    });
  }
  function apply(current: DraftField) {
    const text = replacement.trim();
    if (!text) return;
    if (["[total]", "[amount]", "[contribution]"].includes(current.token)) {
      try {
        if (parseMoney(text) <= 0) throw new Error();
      } catch {
        setError("Use a positive amount with up to 2 decimal places.");
        return;
      }
    }
    replace(current, text);
  }
  return (
    <Popover
      open={Boolean(field) && !disabled}
      onOpenChange={(open) => {
        if (!open) {
          editorOpen.current = false;
          focusRequest.current++;
          setEditor(undefined);
        }
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="relative rounded-lg bg-background">
          {/* The native textarea owns text and selection; the mirror supplies
              highlights and exact anchor rectangles, including wrapped lines. */}
          <div
            ref={mirror}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 text-base leading-6 whitespace-pre-wrap text-transparent [overflow-wrap:anywhere]"
          >
            {fields.map((current, index) => (
              <Fragment key={`${current.start}:${current.token}`}>
                {value.slice(index ? fields[index - 1].end : 0, current.start)}
                <mark
                  data-placeholder-start={current.start}
                  className="rounded-sm bg-primary/25 text-transparent"
                >
                  {current.token}
                </mark>
              </Fragment>
            ))}
            {value.slice(fields.at(-1)?.end ?? 0)}
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
            onPointerDown={(event) => {
              if (event.button !== 0 || disabled) return;
              const hit = fieldAtPoint(event.clientX, event.clientY);
              if (!hit) return;
              event.preventDefault();
              openEditor(
                hit.field,
                hit.mark,
                hit.fragment,
                event.currentTarget,
              );
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
            <p
              id="activity-draft-help"
              className="text-xs text-muted-foreground"
            >
              Tap a highlighted detail to fill it in.
            </p>
            <div
              className="flex flex-wrap items-center gap-1.5"
              aria-label="Fill in draft details"
            >
              {fields.map((current) => (
                <Button
                  key={`${current.start}:${current.token}`}
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  data-draft-field-trigger
                  aria-haspopup="dialog"
                  aria-expanded={field?.start === current.start}
                  className="h-auto min-h-9 rounded-lg px-2.5 py-1.5 text-xs pointer-coarse:min-h-11"
                  onClick={(event) => {
                    const mark = mirror.current?.querySelector<HTMLElement>(
                      `[data-placeholder-start="${current.start}"]`,
                    );
                    const input = textareaRef.current;
                    if (!mark || !input) return;
                    const rect = mark.getClientRects()[0];
                    const bounds = input.getBoundingClientRect();
                    if (
                      rect &&
                      (rect.top < bounds.top || rect.bottom > bounds.bottom)
                    ) {
                      input.scrollTop += rect.top - bounds.top - 10;
                      if (mirror.current)
                        mirror.current.scrollTop = input.scrollTop;
                    }
                    openEditor(current, mark, 0, event.currentTarget);
                  }}
                >
                  {isDate(current)
                    ? "Choose due date"
                    : placeholderLabels[current.token]}
                  {isDate(current) && <CalendarDays className="size-3.5" />}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      {field && (
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          updatePositionStrategy="always"
          aria-label={
            isDate(field)
              ? "Choose due date"
              : `Enter ${placeholderLabels[field.token].toLowerCase()}`
          }
          className={`max-h-(--radix-popover-content-available-height) overflow-y-auto overscroll-contain p-3 motion-reduce:animate-none ${isDate(field) ? "w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl" : "w-[min(18rem,calc(100vw-1.5rem))] space-y-2"}`}
          onPointerDownOutside={(event) => {
            const pointer = event.detail.originalEvent;
            // A direct tap on another field switches editors in one gesture.
            if (
              pointer.target === textareaRef.current &&
              fieldAtPoint(pointer.clientX, pointer.clientY)
            )
              event.preventDefault();
          }}
          onInteractOutside={(event) => {
            const target = event.detail.originalEvent.target;
            if (
              target instanceof Element &&
              target.closest("[data-draft-field-trigger]")
            ) {
              event.preventDefault();
              return;
            }
            restoreFocus.current = false;
          }}
          onEscapeKeyDown={() => {
            restoreFocus.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocus.current && !editorOpen.current)
              focusReturn.current?.focus();
          }}
        >
          {isDate(field) ? (
            <DatePickerCalendar
              today={today}
              onValueChange={(date) => replace(field, dateLabel(date, true))}
            />
          ) : (
            <>
              <label
                htmlFor="activity-draft-field"
                className="text-sm font-medium"
              >
                {placeholderLabels[field.token]}
              </label>
              <div className="flex gap-2">
                <Input
                  ref={editorInput}
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
            </>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
