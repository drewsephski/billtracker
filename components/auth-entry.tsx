import { redirect } from "next/navigation";
import { AuthForm } from "./account-forms";
import { PublicShell } from "./public-shell";
import { InvitationUnavailable } from "./invitation-status";
import { invitationDestination } from "@/lib/domain/navigation";
import { invitationPreview } from "@/lib/server/households";
import { getAuth } from "@/lib/server/auth";
export async function AuthEntry({
  mode,
  next,
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
}) {
  const destination = invitationDestination(next);
  const joining = destination.startsWith("/join/");
  const invite = joining
    ? await invitationPreview(destination.split("/").at(-1)!)
    : null;
  if (joining && !invite) return <InvitationUnavailable />;
  const { data } = await getAuth().getSession({
    query: { disableCookieCache: "true" },
  });
  if (data?.user) redirect(destination);
  return (
    <PublicShell
      title={
        invite
          ? `${mode === "sign-in" ? "Sign in" : "Create an account"} to join ${invite.name}.`
          : mode === "sign-in"
            ? "Good to have you back."
            : "Make yourself at home."
      }
      description={
        invite
          ? "Your invitation will be waiting after you sign in."
          : mode === "sign-in"
            ? "Sign in to see how things are looking at home."
            : "A calmer way to keep up with shared bills starts here."
      }
    >
      <AuthForm mode={mode} next={destination} email={invite?.email} />
    </PublicShell>
  );
}
