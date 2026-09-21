import { notFound } from "next/navigation";
import { currentHousehold } from "@/lib/server/current";
import { BillDetail } from "@/components/bill-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await currentHousehold();
  const bill = data.bills.find((b) => b.id === id);
  if (!bill) notFound();
  return <BillDetail data={data} bill={bill} />;
}
