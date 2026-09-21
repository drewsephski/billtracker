import { PublicShell } from "@/components/public-shell";
import { JoinLinkForm } from "@/components/join-link-form";

export const metadata = { title: "Join a home" };

export default function Page() {
  return (
    <PublicShell
      variant="key"
      title="Have an invite?"
      description="Enter the invite code or link your roommate shared with you."
    >
      <JoinLinkForm />
    </PublicShell>
  );
}
