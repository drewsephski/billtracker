"use client";
import { useState, useSyncExternalStore } from "react";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { Button } from "@/components/ui/button";
import { Feedback } from "./feedback";

const subscribe = () => () => {};

export function InviteLinkActions({ url }: { url: string }) {
  const supportsShare = useSyncExternalStore(
    subscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {supportsShare && (
          <Button
            type="button"
            disabled={sharing}
            className="flex-1"
            onClick={async () => {
              setError(undefined);
              setSharing(true);
              try {
                // Invoke directly from the tap: Safari requires transient activation.
                await navigator.share({
                  title: "Join our home on Homeshare",
                  text: "Join our home on Homeshare so we can keep track of bills and settle up together.",
                  url,
                });
              } catch (error) {
                if (!(
                  (error instanceof Error || error instanceof DOMException) &&
                  error.name === "AbortError"
                ))
                  setError(
                    "Couldn’t share the invite. Copy the link below instead.",
                  );
              } finally {
                setSharing(false);
              }
            }}
          >
            <AnimatedIcon name="share" />
            Share invite
          </Button>
        )}
        <Button
          type="button"
          variant={supportsShare ? "outline" : "default"}
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setError(undefined);
            } catch {
              setCopied(false);
              setError(
                "Couldn’t copy the link. Select it above and copy it manually.",
              );
            }
          }}
        >
          <AnimatedIcon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <span role="status" className="sr-only">
        {copied ? "Invite link copied." : ""}
      </span>
      {error && <Feedback state={{ error }} />}
    </>
  );
}
