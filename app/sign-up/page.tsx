import { AuthForm } from "@/components/account-forms";
import { PublicShell } from "@/components/public-shell";
export const metadata = { title: "Create an account" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <PublicShell
      title="Make yourself at home."
      description="A calmer way to keep up with shared bills starts here."
    >
      <AuthForm mode="sign-up" next={next} />
    </PublicShell>
  );
}
