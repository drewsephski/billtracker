import { currentHousehold } from "@/lib/server/current";
import { AppShell } from "@/components/app-shell";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await currentHousehold();
  return <AppShell data={data}>{children}</AppShell>;
}
