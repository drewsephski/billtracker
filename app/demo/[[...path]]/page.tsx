import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/dashboard";
import { BillsView } from "@/components/bills-view";
import { BillDetail } from "@/components/bill-detail";
import { HouseholdView } from "@/components/household-view";
import { SettingsView } from "@/components/settings-view";
import { demoData } from "@/lib/demo";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Explore Homeshare",
  robots: { index: false },
};
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { path = [] } = await params;
  const { filter } = await searchParams;
  const data = demoData();
  let content;
  if (!path.length || path[0] === "dashboard")
    content = <Dashboard data={data} demo />;
  else if (path[0] === "bills" && path[1]) {
    const bill = data.bills.find((b) => b.id === path[1]);
    if (!bill) notFound();
    content = <BillDetail data={data} bill={bill} demo />;
  } else if (path[0] === "bills")
    content = <BillsView data={data} filter={filter} demo />;
  else if (path[0] === "household")
    content = <HouseholdView data={data} demo />;
  else if (path[0] === "settings") content = <SettingsView data={data} demo />;
  else notFound();
  return (
    <AppShell data={data} demo>
      {content}
    </AppShell>
  );
}
