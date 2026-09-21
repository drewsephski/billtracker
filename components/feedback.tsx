"use client";
import { Reveal } from "./ui/motion";
import Link from "next/link";
import { Button } from "./ui/button";
import { AnimatedIcon } from "./icons/animated-icon";
import { Blob } from "./blob";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, CircleAlert, Info } from "lucide-react";
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
  return (
    <Reveal key={state.error || state.success}>
      <Alert
        variant={state.error ? "destructive" : "default"}
        role={state.error ? "alert" : "status"}
      >
        {state.error ? <CircleAlert /> : <CheckCircle2 />}
        <AlertDescription className="flex items-center gap-3">
          <span className="flex-1">{state.error || state.success}</span>
          {state.success && !state.error && (
            <Blob className="size-10 shrink-0" />
          )}
        </AlertDescription>
      </Alert>
    </Reveal>
  );
}
