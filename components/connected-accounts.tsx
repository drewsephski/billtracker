"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/client/auth";
import { oauthErrorMessage } from "@/lib/domain/auth-errors";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { Feedback } from "@/components/feedback";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function ConnectedAccounts({
  googleConnected,
  error,
}: {
  googleConnected: boolean | null;
  error?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();
  async function connect() {
    setPending(true);
    setFailure(undefined);
    try {
      const result = await authClient.linkSocial({
        provider: "google",
        callbackURL: "/settings",
        errorCallbackURL: "/settings",
      });
      if (result.error)
        setFailure(oauthErrorMessage(result.error.code || "unknown", "link"));
      else router.refresh();
    } catch {
      setFailure(oauthErrorMessage("unknown", "link"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Text muted small>
          {googleConnected === null
            ? "We couldn’t check your connected accounts. Refresh to try again."
            : googleConnected
              ? "Google is connected. You can use it to sign in."
              : "Connect Google using the same email as your Homeshare account. Your email and password sign-in will still work."}
        </Text>
        <Feedback state={{ error: failure || error }} />
        {googleConnected === null ? (
          <Button variant="outline" onClick={() => router.refresh()}>
            Refresh accounts
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={pending || googleConnected}
            onClick={connect}
          >
            {googleConnected
              ? "Google connected"
              : pending
                ? "Connecting…"
                : "Connect Google"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
