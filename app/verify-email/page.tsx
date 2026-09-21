import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { invitationDestination } from "@/lib/domain/navigation";
import { PublicShell } from "@/components/public-shell";
import { VerifyEmailLookupForm, VerifyForm } from "@/components/account-forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lookup?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = invitationDestination(params.next);
  if (params.lookup === "1")
    return (
      <PublicShell
        showInviteLink
        title="Confirm your email."
        description="Enter the email you used for Homeshare and we’ll send a six-digit code."
      >
        <VerifyEmailLookupForm next={next} />
      </PublicShell>
    );
  const user = await requireUser(next);
  if (user.emailVerified) redirect(next);
  return (
    <PublicShell
      showInviteLink
      title="Let’s verify it’s you."
      description={`Request a code for ${user.email}, then enter it below.`}
    >
      <VerifyForm next={next} />
    </PublicShell>
  );
}
