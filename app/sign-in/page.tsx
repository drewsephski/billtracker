import { AuthEntry } from "@/components/auth-entry";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthEntry mode="sign-in" next={next} />;
}
