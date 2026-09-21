"use client";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoNotice, Feedback } from "./feedback";
import { paymentAction } from "@/lib/server/actions";
import type { ActionResult } from "@/lib/domain/types";
export function PaymentButton({
  householdId,
  billId,
  splitId,
  paymentId,
  name,
  demo,
  className,
}: {
  householdId: string;
  billId: string;
  splitId: string;
  paymentId: string | null;
  name: string;
  demo?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionResult>({});
  return (
    <>
      <Button
        className={className}
        size="sm"
        variant={paymentId ? "ghost" : "outline"}
        disabled={pending}
        aria-label={`${paymentId ? "Undo payment for" : "Mark paid for"} ${name}`}
        onClick={() => {
          if (demo) {
            setState({
              error:
                "This is a read-only demo. Create an account to track your own bills.",
            });
            return;
          }
          startTransition(async () => {
            try {
              setState(
                await paymentAction(
                  householdId,
                  billId,
                  splitId,
                  paymentId || undefined,
                ),
              );
            } catch {
              setState({ error: "Connection interrupted. Please try again." });
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : paymentId ? (
          <AnimatedIcon name="undo" data-icon="inline-start" />
        ) : (
          <AnimatedIcon name="check" data-icon="inline-start" />
        )}
        {paymentId ? "Undo" : "Mark paid"}
      </Button>
      {(state.error || state.success) && (
        <div className="col-span-full min-w-0">
          {demo ? <DemoNotice /> : <Feedback state={state} />}
        </div>
      )}
    </>
  );
}
