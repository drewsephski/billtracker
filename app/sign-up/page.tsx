import { AuthEntry } from "@/components/auth-entry";
import {
  oauthErrorMessage,
  type AuthSearchParams,
} from "@/lib/domain/auth-errors";
export const metadata = { title: "Create an account" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AuthSearchParams>;
}) {
  const params = await searchParams;
  return (
    <AuthEntry
      mode="sign-up"
      next={typeof params.next === "string" ? params.next : undefined}
      oauthError={oauthErrorMessage(params.error)}
    />
  );
}
