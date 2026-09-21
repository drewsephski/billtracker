"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Feedback } from "./feedback";
export function JoinLinkForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const value = String(
          new FormData(event.currentTarget).get("invitation") || "",
        ).trim();
        try {
          const token = /^[a-f0-9]{64}$/.test(value)
            ? value
            : new URL(value, window.location.origin).pathname.match(
                /^\/join\/([a-f0-9]{64})$/,
              )?.[1];
          if (!token) throw new Error();
          router.push(`/join/${token}`);
        } catch {
          setError(
            "Enter the invite code or paste the link your roommate shared.",
          );
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="invitation">Invite code or link</FieldLabel>
        <Input
          id="invitation"
          name="invitation"
          required
          placeholder="Paste a link or enter the code"
        />
        <FieldDescription>
          No need to create a household. Join the one your roommate already set
          up.
        </FieldDescription>
      </Field>
      <Feedback state={{ error }} />
      <Button type="submit" variant="outline" className="w-full">
        Continue to invitation
      </Button>
    </form>
  );
}
