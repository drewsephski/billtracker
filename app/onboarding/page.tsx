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
      <ol
        aria-label="Set up your household"
        className="mb-6 flex items-center gap-3 text-xs text-muted-foreground"
      >
        <li
          aria-current="step"
          className="flex items-center gap-2 font-medium text-primary"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-secondary">
            1
          </span>
          Your home
        </li>
        <li aria-hidden className="h-px flex-1 bg-border" />
        <li className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-muted">
            2
          </span>
          Your roommates
        </li>
      </ol>
      <HouseholdForm />
      <Text small muted className="mt-6">
        Joining an existing household? Open the invitation link your roommate
        shared with you.
      </Text>
    </PublicShell>
  );
}
