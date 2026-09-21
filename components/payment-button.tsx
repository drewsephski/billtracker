"use client";
import { useState, useTransition } from "react";
import { Check, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "./feedback";
import { paymentAction } from "@/lib/server/actions";
import type { ActionResult } from "@/lib/domain/types";
export function PaymentButton({
  householdId,
  billId,
  splitId,
  paymentId,
  name,
  demo,
}: {
  householdId: string;
  billId: string;
  splitId: string;
  paymentId: string | null;
  name: string;
  demo?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionResult>({});
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
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
          <Undo2 data-icon="inline-start" />
        ) : (
          <Check data-icon="inline-start" />
        )}
        {paymentId ? "Undo" : "Mark paid"}
      </Button>
      <Feedback state={state} />
    </div>
  );
}
