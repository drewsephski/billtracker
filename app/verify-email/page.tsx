import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { invitationDestination } from "@/lib/domain/navigation";
import { PublicShell } from "@/components/public-shell";
import { VerifyForm } from "@/components/account-forms";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = invitationDestination((await searchParams).next);
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
