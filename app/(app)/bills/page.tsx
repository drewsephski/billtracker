import { currentHousehold } from "@/lib/server/current";
import { BillsView } from "@/components/bills-view";
export const metadata = { title: "Bills" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  return <BillsView data={await currentHousehold()} filter={filter} />;
}
