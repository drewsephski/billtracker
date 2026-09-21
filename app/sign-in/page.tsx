import { AuthForm } from "@/components/account-forms";
import { PublicShell } from "@/components/public-shell";
export const metadata = { title: "Sign in" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <PublicShell
      title="Good to have you back."
      description="Sign in to see how things are looking at home."
    >
      <AuthForm mode="sign-in" next={next} />
    </PublicShell>
  );
}
