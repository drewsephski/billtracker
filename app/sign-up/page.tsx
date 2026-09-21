import { AuthEntry } from "@/components/auth-entry";
export const metadata = { title: "Create an account" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthEntry mode="sign-up" next={next} />;
}
