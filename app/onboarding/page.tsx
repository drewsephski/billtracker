export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { membershipFor } from "@/lib/server/households";
import { HouseholdForm } from "@/components/account-forms";
import { PublicShell } from "@/components/public-shell";
import { Text } from "@/components/ui/typography";
export default async function Page() {
  const user = await requireUser();
  if (await membershipFor(user)) redirect("/dashboard");
  return (
    <PublicShell
      title="Every home needs a home base."
      description="Give your shared space a name. You can invite roommates next."
    >
      <HouseholdForm />
      <Text small muted className="mt-6">
        Joining an existing household? Open the invitation link your roommate
        shared with you.
      </Text>
    </PublicShell>
  );
}
