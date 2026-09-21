"use client";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoNotice, Feedback } from "./feedback";
import { paymentAction } from "@/lib/server/actions";
import type { ActionResult } from "@/lib/domain/types";
export function PaymentActions({
  householdId,
  billId,
  splitId,
  paymentId,
  canPay,
  name,
  undoLabel = "Undo",
  demo,
}: {
  householdId: string;
  billId: string;
  splitId: string;
  paymentId: string | null;
  canPay: boolean;
  name: string;
  undoLabel?: string;
  demo?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionResult>({});
  return (
    <>
      <div className="col-span-2 col-start-2 flex flex-wrap justify-end gap-1 @min-[440px]:col-span-1 @min-[440px]:col-start-4">
        {[...(canPay ? [null] : []), ...(paymentId ? [paymentId] : [])].map(
          (actionPaymentId) => (
            <Button
              key={actionPaymentId ?? "pay"}
              size="sm"
              variant={actionPaymentId ? "ghost" : "outline"}
              disabled={pending}
              aria-label={`${actionPaymentId ? "Undo payment for" : "Mark paid for"} ${name}`}
              onClick={() => {
                if (demo) {
                  setState({ error: "This is a read-only demo." });
                  return;
                }
                startTransition(async () => {
                  try {
                    setState(
                      await paymentAction(
                        householdId,
                        billId,
                        splitId,
                        actionPaymentId || undefined,
                      ),
                    );
                  } catch {
                    setState({
                      error: "Connection interrupted. Please try again.",
                    });
                  }
                });
              }}
            >
              {pending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : actionPaymentId ? (
                <AnimatedIcon name="undo" data-icon="inline-start" />
              ) : (
                <AnimatedIcon name="check" data-icon="inline-start" />
              )}
              {actionPaymentId ? undoLabel : "Mark paid"}
            </Button>
          ),
        )}
      </div>
      {(state.error || state.success) && (
        <div className="col-span-full min-w-0 pt-2">
          {demo ? <DemoNotice /> : <Feedback state={state} />}
        </div>
      )}
    </>
  );
}
