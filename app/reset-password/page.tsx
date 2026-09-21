import { PublicShell } from "@/components/public-shell";
import { PasswordForm } from "@/components/account-forms";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  return (
    <PublicShell
      title={token ? "A fresh password." : "Request a new reset link."}
      description="Choose a password of at least eight characters."
    >
      <PasswordForm token={token} next={next} />
    </PublicShell>
  );
}
