import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicShell } from "./public-shell";
export function InvitationUnavailable() {
  return (
    <PublicShell
      title="Let’s find your way home."
      description="This invitation has expired, was replaced, or has already been used. Ask your roommate for a fresh link."
    >
      <Button asChild className="w-full">
        <Link href="/dashboard">Go to your households</Link>
      </Button>
    </PublicShell>
  );
}
