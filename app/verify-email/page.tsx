export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { PublicShell } from "@/components/public-shell";
import { VerifyForm } from "@/components/account-forms";
import { Button } from "@/components/ui/button";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await requireUser();
  const { next } = await searchParams;
  const back =
    next && /^\/join\/[a-f0-9]{64}$/.test(next) ? next : "/dashboard";
  return (
    <PublicShell
      title="Let’s verify it’s you."
      description={`We’ll send a code to ${user.email}.`}
    >
      <VerifyForm />
      <Button asChild variant="link" className="mt-4 w-full">
        <Link href={back}>Continue</Link>
      </Button>
    </PublicShell>
  );
}
