"use client";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { Feedback } from "./feedback";
import {
  acceptAction,
  authenticate,
  createHouseholdAction,
  inviteAction,
  requestPasswordReset,
  resetPassword,
  revokeAction,
  sendVerification,
  settingsAction,
  verifyEmail,
} from "@/lib/server/actions";
import type { ActionResult } from "@/lib/domain/types";
const zones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];
function Submit({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
      {pending ? "One moment…" : children}
    </Button>
  );
}
export function AuthForm({
  mode,
  next = "/dashboard",
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
}) {
  const [state, action, pending] = useActionState(
    authenticate.bind(null, mode),
    {},
  );
  return (
    <form action={action}>
      <FieldGroup>
        <input type="hidden" name="next" value={next} />
        {mode === "sign-up" && (
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input
              id="name"
              name="name"
              placeholder="Sarah"
              autoComplete="given-name"
              required
              maxLength={80}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            minLength={8}
            maxLength={128}
            required
          />
          <FieldDescription>
            {mode === "sign-up" ? (
              "At least 8 characters."
            ) : (
              <Button variant="link" size="sm" asChild className="p-0">
                <Link href="/forgot-password">Forgot your password?</Link>
              </Button>
            )}
          </FieldDescription>
        </Field>
        <Feedback state={state} />
        <Submit pending={pending}>
          {mode === "sign-in" ? "Welcome back" : "Create your account"}
          <AnimatedIcon name="arrow-right" data-icon="inline-end" />
        </Submit>
        <Text muted small className="text-center">
          {mode === "sign-in" ? "New around here?" : "Already have an account?"}{" "}
          <Button variant="link" asChild className="p-0">
            <Link
              href={`/${mode === "sign-in" ? "sign-up" : "sign-in"}?next=${encodeURIComponent(next)}`}
            >
              {mode === "sign-in" ? "Create an account" : "Sign in"}
            </Link>
          </Button>
        </Text>
      </FieldGroup>
    </form>
  );
}
export function HouseholdForm({
  household,
  readOnly = false,
}: {
  household?: { id: string; name: string; timeZone: string };
  readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(
    household ? settingsAction.bind(null, household.id) : createHouseholdAction,
    {},
  );
  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="household-name">Household name</FieldLabel>
          <Input
            id="household-name"
            name="name"
            placeholder="Lake Street Apartment"
            defaultValue={household?.name}
            minLength={2}
            maxLength={80}
            required
            disabled={readOnly}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="time-zone">
            Your household’s time zone
          </FieldLabel>
          <Select
            name="timeZone"
            defaultValue={household?.timeZone || "America/Chicago"}
            disabled={readOnly}
          >
            <SelectTrigger id="time-zone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {[
                  ...new Set([
                    household?.timeZone || "America/Chicago",
                    ...zones,
                  ]),
                ].map((zone) => (
                  <SelectItem value={zone} key={zone}>
                    {zone.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Bills become overdue after their due date in this time zone. All
            amounts are in US dollars.
          </FieldDescription>
        </Field>
        <Feedback state={state} />
        {!readOnly && (
          <Submit pending={pending}>
            {household ? "Save household settings" : "Create your household"}
            <AnimatedIcon name="arrow-right" data-icon="inline-end" />
          </Submit>
        )}
      </FieldGroup>
    </form>
  );
}
export function InviteForm({ householdId }: { householdId: string }) {
  const [state, action, pending] = useActionState(
    inviteAction.bind(null, householdId),
    {},
  );
  const [copiedUrl, setCopiedUrl] = useState<string>();
  const [copyError, setCopyError] = useState<string>();
  const copied = Boolean(state.url && copiedUrl === state.url);
  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">
            Roommate’s email address
          </FieldLabel>
          <Input
            name="email"
            id="invite-email"
            type="email"
            required
            placeholder="emma@example.com"
          />
          <FieldDescription>
            They’ll need to sign in and verify this email to join.
          </FieldDescription>
        </Field>
        <Submit pending={pending}>Create invite link</Submit>
        <Feedback state={state} />
        {state.url && (
          <Field>
            <FieldLabel htmlFor="invite-link">
              Share this link directly with your roommate
            </FieldLabel>
            <Input
              id="invite-link"
              readOnly
              value={state.url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.url!);
                  setCopiedUrl(state.url);
                  setCopyError(undefined);
                } catch {
                  setCopiedUrl(undefined);
                  setCopyError(
                    "Couldn’t copy the link. Select it above and copy it manually.",
                  );
                }
              }}
            >
              {copied ? (
                <Check data-icon="inline-start" />
              ) : (
                <Copy data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy invitation"}
            </Button>
            {copyError && <Feedback state={{ error: copyError }} />}
            <FieldDescription>
              Expires in 7 days. Creating another invitation for this email
              revokes the previous one.
            </FieldDescription>
          </Field>
        )}
      </FieldGroup>
    </form>
  );
}
export function RevokeButton({
  householdId,
  id,
}: {
  householdId: string;
  id: string;
}) {
  const [state, setState] = useState<ActionResult>({});
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setState(await revokeAction(householdId, id));
            } catch {
              setState({ error: "Please try again." });
            }
          })
        }
      >
        Revoke
      </Button>
      <Feedback state={state} />
    </div>
  );
}
export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptAction.bind(null, token),
    {},
  );
  return (
    <form action={action}>
      <FieldGroup>
        <Feedback state={state} />
        <Submit pending={pending}>
          Join household
          <AnimatedIcon name="arrow-right" data-icon="inline-end" />
        </Submit>
      </FieldGroup>
    </form>
  );
}
export function VerifyForm() {
  const [sent, send, sending] = useActionState(sendVerification, {});
  const [verified, verify, verifying] = useActionState(verifyEmail, {});
  return (
    <div className="flex flex-col gap-6">
      <form action={send}>
        <FieldGroup>
          <Feedback state={sent} />
          <Submit pending={sending}>Email me a verification code</Submit>
        </FieldGroup>
      </form>
      <form action={verify}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="otp">Six-digit code</FieldLabel>
            <Input
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </Field>
          <Feedback state={verified} />
          <Submit pending={verifying}>Verify email</Submit>
        </FieldGroup>
      </form>
    </div>
  );
}
export function PasswordForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState(
    token ? resetPassword : requestPasswordReset,
    {},
  );
  return (
    <form action={action}>
      <FieldGroup>
        {token ? (
          <>
            <input type="hidden" name="token" value={token} />
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                name="password"
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </Field>
          </>
        ) : (
          <Field>
            <FieldLabel htmlFor="reset-email">Email address</FieldLabel>
            <Input
              id="reset-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
        )}
        <Feedback state={state} />
        <Submit pending={pending}>
          {token ? "Update password" : "Send reset link"}
        </Submit>
        <Button variant="link" asChild>
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </FieldGroup>
    </form>
  );
}
