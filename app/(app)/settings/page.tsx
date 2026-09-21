import { currentHousehold } from "@/lib/server/current";
import { SettingsView } from "@/components/settings-view";
import { getAuth, requireUser } from "@/lib/server/auth";
import {
  oauthErrorMessage,
  type AuthSearchParams,
} from "@/lib/domain/auth-errors";
export const metadata = { title: "Settings" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AuthSearchParams>;
}) {
  await requireUser();
  let googleConnected: boolean | null = null;
  try {
    const result = await getAuth().listAccounts();
    if (!result.error && result.data)
      googleConnected = result.data.some(
        (account) => account.providerId === "google",
      );
  } catch {
    // A provider outage must not take down the rest of Settings.
  }
  return (
    <SettingsView
      data={await currentHousehold()}
      googleConnected={googleConnected}
      oauthError={oauthErrorMessage((await searchParams).error, "link")}
    />
  );
}
