import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { householdsFor } from "@/lib/server/households";
import { HouseholdForm } from "@/components/account-forms";
import { PublicShell } from "@/components/public-shell";
import { Text } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { JoinLinkForm } from "@/components/join-link-form";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  const homes = await householdsFor(user);
  return (
    <PublicShell
      variant="home"
      title={
        homes.length ? "Make room for another home." : "What do you call home?"
      }
      description="Give your household a name. Everything else can wait."
    >
      <div className="flex flex-col gap-6">
        <HouseholdForm />
        <Text small muted>
          You can invite roommates whenever you’re ready.
        </Text>
        <Disclosure title="Have an invitation instead?">
          <JoinLinkForm />
        </Disclosure>
        {homes.length > 0 && (
          <Button asChild variant="link">
            <Link href="/dashboard">Back to your household</Link>
          </Button>
        )}
      </div>
    </PublicShell>
  );
}
