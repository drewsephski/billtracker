import { AuthEntry } from "@/components/auth-entry";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; verified?: string }>;
}) {
  const { next, verified } = await searchParams;
  return <AuthEntry mode="sign-in" next={next} verified={verified === "1"} />;
}
