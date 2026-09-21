import { getAuth } from "@/lib/server/auth";
import { invitationPreview, membershipFor } from "@/lib/server/households";
import { switchAccount } from "@/lib/server/actions";
import { AcceptForm, AuthForm, VerifyForm } from "@/components/account-forms";
import { PublicShell } from "@/components/public-shell";
import { InvitationUnavailable } from "@/components/invitation-status";
import { Button } from "@/components/ui/button";
import { Text, Eyebrow } from "@/components/ui/typography";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await invitationPreview(token);
  if (!invite) return <InvitationUnavailable />;
  const { data } = await getAuth().getSession({
    query: { disableCookieCache: "true" },
  });
  const user = data?.user;
  const next = `/join/${token}`;
  const matches = user?.email.toLowerCase() === invite.email;
  const member =
    user && matches
      ? await membershipFor(
          {
            id: user.id,
            name: user.name,
            email: user.email.toLowerCase(),
            emailVerified: user.emailVerified,
          },
          invite.householdId,
        )
      : undefined;
  if (invite.acceptedAt && !member) return <InvitationUnavailable />;
  return (
    <PublicShell
      title={member ? `You’re part of ${invite.name}.` : `Join ${invite.name}.`}
      description={
        member
          ? "Your shared space is ready when you are."
          : "One place for your shared bills. Your roommate has saved you a spot."
      }
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl bg-secondary/60 px-4 py-3">
          <Eyebrow>{user ? "Your account" : "Your invitation"}</Eyebrow>
          <Text small className="mt-1 break-all font-medium">
            {user?.email || invite.email}
          </Text>
        </div>
        {!user ? (
          <AuthForm mode="sign-up" next={next} email={invite.email} />
        ) : !matches ? (
          <>
            <Text small muted>
              This invitation is for{" "}
              <span className="break-all font-medium text-foreground">
                {invite.email}
              </span>
              . Switch accounts to accept it.
            </Text>
            <form action={switchAccount.bind(null, next)}>
              <Button type="submit" className="w-full">
                Use the invited email
              </Button>
            </form>
          </>
        ) : !user.emailVerified ? (
          <>
            <Text small muted>
              Confirm your email to join. Request a code below, then enter it
              here. We’ll keep your invitation ready.
            </Text>
            <VerifyForm next={next} />
          </>
        ) : (
          <>
            {!member && (
              <Text small muted>
                You can belong to more than one household. Each home has its own
                bills and roommates.
              </Text>
            )}
            <AcceptForm token={token} alreadyJoined={Boolean(member)} />
          </>
        )}
        {user && matches && (
          <form action={switchAccount.bind(null, next)}>
            <Button type="submit" variant="link" className="w-full">
              Use a different account
            </Button>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
