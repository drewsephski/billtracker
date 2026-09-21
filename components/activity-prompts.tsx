"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import type { ActivityPrompt } from "@/lib/domain/activity-prompts";

export function ActivityPromptChoices({
  prompts,
  disabled,
  onPick,
  compact = false,
}: {
  prompts: ActivityPrompt[];
  disabled: boolean;
  onPick: (prompt: ActivityPrompt) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact ? "flex flex-wrap gap-2" : "grid min-w-0 gap-2 sm:grid-cols-3"
      }
      aria-label={
        compact ? "Suggested next steps" : "Household prompt suggestions"
      }
    >
      {prompts.map((prompt, i) => (
        <Button
          key={i}
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onPick(prompt)}
          className={
            compact
              ? "h-auto min-h-11 max-w-full whitespace-normal px-3 py-2 text-left text-xs"
              : "group h-auto min-h-11 min-w-0 items-start justify-start whitespace-normal rounded-xl bg-background/40 p-3 text-left"
          }
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{prompt.label}</span>
            {!compact && (
              <span className="mt-1 block break-words text-xs font-normal leading-relaxed text-muted-foreground">
                {prompt.text}
              </span>
            )}
          </span>
          {!compact && (
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          )}
        </Button>
      ))}
    </div>
  );
}

export function ActivityStarters({
  householdId,
  disabled,
  onPick,
}: {
  householdId: string;
  disabled: boolean;
  onPick: (prompt: ActivityPrompt) => void;
}) {
  const [prompts, setPrompts] = useState<ActivityPrompt[]>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/activity/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Suggestions unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setPrompts(data.prompts);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPrompts([]);
      });
    return () => controller.abort();
  }, [householdId]);
  if (!prompts)
    return (
      <Text small muted role="status">
        Finding a few ideas for your home…
      </Text>
    );
  if (!prompts.length)
    return (
      <Text small muted>
        Describe one contribution, or attach a bill to get started.
      </Text>
    );
  return (
    <div className="space-y-2">
      <Text small muted className="text-xs">
        Pick a draft, then edit it to match what happened.
      </Text>
      <ActivityPromptChoices
        prompts={prompts}
        disabled={disabled}
        onPick={onPick}
      />
    </div>
  );
}
