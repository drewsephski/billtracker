"use client";
import { Reveal } from "./ui/motion";
import Link from "next/link";
import { Button } from "./ui/button";
import { AnimatedIcon } from "./icons/animated-icon";
import { Blob } from "./blob";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/domain/types";

export function DemoNotice() {
  return (
    <Reveal>
      <Alert className="rounded-2xl border-primary/10 bg-secondary/40 p-4 has-[>svg]:gap-x-3">
        <Info className="mt-0.5 text-primary" />
        <div className="flex min-w-0 flex-col items-start gap-3 @min-[440px]:flex-row @min-[440px]:items-center @min-[440px]:justify-between @min-[440px]:gap-5">
          <div className="space-y-1">
            <p className="font-medium">This is a read-only demo.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Create an account to track your own household bills.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/sign-up">
              Sign up
              <AnimatedIcon name="arrow-up-right" data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </Alert>
    </Reveal>
  );
}
export function Feedback({ state }: { state: ActionResult }) {
  if (!state.error && !state.success) return null;
  const success = Boolean(state.success && !state.error);
  return (
    <Reveal key={state.error || state.success}>
      <Alert
        variant={state.error ? "destructive" : "default"}
        className={cn(
          success &&
            "grid-cols-[auto_minmax(0,1fr)] items-center border-success/30 bg-success/5",
        )}
        role={state.error ? "alert" : "status"}
      >
        {state.error ? (
          <CircleAlert />
        ) : (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <AnimatedIcon name="check" animateOnMount />
          </span>
        )}
        <AlertDescription className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1">{state.error || state.success}</span>
          {state.success && !state.error && (
            <Blob variant="chat" sizes="32px" className="size-8 shrink-0" />
          )}
        </AlertDescription>
      </Alert>
    </Reveal>
  );
}
