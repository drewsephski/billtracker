import Link from "next/link";
import { House, Check } from "lucide-react";
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
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-7xl items-center justify-between p-5 sm:px-10">
        <Brand />
        <Button variant="ghost" asChild>
          <Link href="/demo">Take a peek</Link>
        </Button>
      </header>
      <main className="mx-auto grid max-w-5xl items-center gap-12 px-5 py-10 md:grid-cols-2 md:py-20">
        <div className="hidden flex-col gap-7 md:flex">
          <House className="size-12 text-primary" strokeWidth={1.4} />
          <Eyebrow>Shared home. Clear bills.</Eyebrow>
          <Heading className="text-5xl leading-tight">
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
        <Card>
          <CardHeader>
            <CardTitle>
              <Heading level={2}>{title}</Heading>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
