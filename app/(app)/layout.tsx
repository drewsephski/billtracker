import { currentHousehold, currentHouseholds } from "@/lib/server/current";
import { AppShell } from "@/components/app-shell";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, households] = await Promise.all([
    currentHousehold(),
    currentHouseholds(),
  ]);
  return (
    <AppShell key={data.household.id} data={data} households={households}>
      {children}
    </AppShell>
  );
}
