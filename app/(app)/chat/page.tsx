import { currentHousehold } from "@/lib/server/current";
import { requireUser } from "@/lib/server/auth";
import { listChat } from "@/lib/server/chat";
import { HouseChat } from "@/components/house-chat";
export default async function ChatPage() {
  const data = await currentHousehold();
  const initial = await listChat(await requireUser(), data.household.id);
  return (
    <HouseChat
      key={data.household.id}
      householdId={data.household.id}
      householdName={data.household.name}
      viewerId={data.viewer.id}
      viewerName={data.viewer.name}
      memberCount={data.members.length}
      timeZone={data.household.timeZone}
      today={data.today}
      initial={initial}
    />
  );
}
