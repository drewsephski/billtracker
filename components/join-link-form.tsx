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
          const url = new URL(value, window.location.origin);
          if (!/^\/join\/[a-f0-9]{64}$/.test(url.pathname)) throw new Error();
          router.push(url.pathname);
        } catch {
          setError("Paste the full invitation link your roommate shared.");
        }
      }}
    >
      <Field>
        <FieldLabel htmlFor="invitation">Invitation link</FieldLabel>
        <Input
          id="invitation"
          name="invitation"
          required
          placeholder="Paste your invitation link"
        />
        <FieldDescription>
          No need to create a household. Join the one your roommate already set
          up.
        </FieldDescription>
      </Field>
      <Feedback state={{ error }} />
      <Button type="submit" variant="outline" className="w-full">
        Open invitation
      </Button>
    </form>
  );
}
