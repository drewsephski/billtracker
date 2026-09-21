import { PublicShell } from "@/components/public-shell";
import { PasswordForm } from "@/components/account-forms";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <PublicShell
      showInviteLink
      title="Let’s get you back in."
      description="Enter your email and we’ll send a password reset link."
    >
      <PasswordForm next={next} />
    </PublicShell>
  );
}
