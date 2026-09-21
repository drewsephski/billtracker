import { currentHousehold } from "@/lib/server/current";
import { Dashboard } from "@/components/dashboard";
export const metadata = { title: "Overview" };
export default async function Page() {
  return <Dashboard data={await currentHousehold()} />;
}
