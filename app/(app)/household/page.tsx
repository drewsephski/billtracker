import { currentHousehold } from "@/lib/server/current";
import { requireUser } from "@/lib/server/auth";
import { listInvitations } from "@/lib/server/households";
import { HouseholdView } from "@/components/household-view";
export const metadata = { title: "Household" };
export default async function Page() {
  const data = await currentHousehold();
  const invitations =
    data.viewer.role === "owner"
      ? await listInvitations(await requireUser(), data.household.id)
      : [];
  return <HouseholdView data={data} invitations={invitations} />;
}
