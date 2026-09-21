import Link from "next/link";
import { Check } from "lucide-react";
import { Blob, type BlobVariant } from "./blob";
import { Reveal } from "./ui/motion";
import { Brand } from "./brand";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heading, Text, Eyebrow } from "@/components/ui/typography";
export function PublicShell({
  title,
  description,
  variant = "key",
  showInviteLink = false,
  children,
}: {
  title: string;
  description: string;
  variant?: BlobVariant;
  showInviteLink?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-7xl shrink-0 items-center justify-between gap-3 px-5 py-6 sm:px-10">
        <Brand />
        <nav aria-label="Account" className="flex items-center gap-2">
          {showInviteLink && (
            <Button variant="ghost" asChild>
              <Link href="/join">Have an invite?</Link>
            </Button>
          )}
          <Button
            variant="ghost"
            asChild
            className={showInviteLink ? "hidden sm:inline-flex" : undefined}
          >
            <Link href="/demo">Take a peek</Link>
          </Button>
        </nav>
      </header>
      <main className="min-h-0 flex-1 mx-auto grid max-w-5xl items-center gap-10 px-5 py-5 md:grid-cols-[0.9fr_1.1fr] md:grid-rows-[minmax(0,1fr)] md:gap-16 md:py-12">
        <div className="hidden flex-col gap-7 md:flex">
          <Blob variant={variant} sizes="144px" className="size-36" />
          <Eyebrow>Shared home. Clear bills.</Eyebrow>
          <Heading level={2} className="text-4xl leading-tight">
            Less “who owes what?”
            <br />
            More feeling at home.
          </Heading>
          <Text muted>
            A simple place for your household bills.
            <br />
            Made for roommates, and real life.
          </Text>
          <div className="flex flex-col gap-3">
            {[
              "Everyone knows their share",
              "All your bills in one place",
              "A little less awkward asking",
            ].map((t) => (
              <Text small key={t} className="flex items-center gap-2">
                <Check className="size-4 text-primary" />
                {t}
              </Text>
            ))}
          </div>
        </div>
        <Reveal>
          <Card className="relative">
            <div className="flex items-center gap-3 px-5 md:hidden">
              <Blob variant={variant} sizes="80px" className="size-20" />
              <Eyebrow>Make yourself at home</Eyebrow>
            </div>
            <CardHeader>
              <CardTitle>
                <Heading className="break-words text-2xl sm:text-3xl">
                  {title}
                </Heading>
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>
        </Reveal>
      </main>
    </div>
  );
}
