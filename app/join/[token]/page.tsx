import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuth } from "@/lib/server/auth";
import { AcceptForm } from "@/components/account-forms";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data } = await getAuth().getSession();
  const next = encodeURIComponent(`/join/${token}`);
  return (
    <PublicShell
      title="There’s a place for you."
      description="Your roommate invited you to join their household on Homeshare."
    >
      {data?.user ? (
        <div className="flex flex-col gap-5">
          <Text small muted>
            Signed in as {data.user.email}. This must match the email on the
            invitation.
          </Text>
          {!data.user.emailVerified && (
            <Button asChild variant="outline">
              <Link href={`/verify-email?next=${next}`}>
                Verify your email first
              </Link>
            </Button>
          )}
          <AcceptForm token={token} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href={`/sign-up?next=${next}`}>
              Create an account to join
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/sign-in?next=${next}`}>
              I already have an account
            </Link>
          </Button>
        </div>
      )}
    </PublicShell>
  );
}
