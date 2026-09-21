import { PublicShell } from "@/components/public-shell";
import { PasswordForm } from "@/components/account-forms";
export default function Page() {
  return (
    <PublicShell
      title="Let’s get you back in."
      description="Enter your email and we’ll send a password reset link."
    >
      <PasswordForm />
    </PublicShell>
  );
}
