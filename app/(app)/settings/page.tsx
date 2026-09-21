import { currentHousehold } from "@/lib/server/current";
import { SettingsView } from "@/components/settings-view";
export const metadata = { title: "Settings" };
export default async function Page() {
  return <SettingsView data={await currentHousehold()} />;
}
