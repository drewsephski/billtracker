"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/feedback";
import type { ActionResult } from "@/lib/domain/types";

const authClient = createAuthClient();

export function GoogleSignIn({ callbackURL }: { callbackURL: string }) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    setState({});
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
      if (result.error) setState({ error: result.error.message });
    } catch {
      setState({ error: "Google sign-in is temporarily unavailable." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={signIn}
        disabled={pending}
      >
        {pending ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <span aria-hidden className="font-semibold text-base">
            G
          </span>
        )}
        {pending ? "Connecting…" : "Continue with Google"}
      </Button>
      <Feedback state={state} />
    </div>
  );
}
