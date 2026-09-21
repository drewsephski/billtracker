import Link from "next/link";
import {
  ArrowRight,
  Check,
  House,
  HeartHandshake,
  Repeat2,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Heading, Text, Eyebrow } from "@/components/ui/typography";
import { BillCard } from "@/components/bill-card";
import { demoData } from "@/lib/demo";
export default function Home() {
  const data = demoData();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-6 sm:px-10">
        <Brand />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">
              Get started
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-10">
        <section className="grid items-center gap-12 py-12 md:grid-cols-[1.2fr_1fr] md:gap-20 md:py-24">
          <div className="flex flex-col items-start gap-7">
            <Badge variant="secondary">
              <House data-icon="inline-start" />A little less bill stress
            </Badge>
            <Heading className="text-5xl leading-[1.08] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Share a home.
              <br />
              Stay on the
              <br />
              <span className="text-primary">same page.</span>
            </Heading>
            <Text muted className="max-w-md text-lg">
              The electricity. The internet. The “did you pay that yet?” One
              friendly place for all your household bills.
            </Text>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/sign-up">
                  Bring your home together
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/demo">Take a look around</Link>
              </Button>
            </div>
            <Text small muted className="flex items-center gap-2">
              <Check className="size-4" />
              Simple to start. Made for real roommates.
            </Text>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="mb-5 flex items-center justify-between">
              <Eyebrow>Lake Street Apartment</Eyebrow>
              <Badge variant="outline">3 roommates</Badge>
            </div>
            <BillCard bill={data.bills[1]} today={data.today} demo />
            <Card size="sm" className="mx-4 mt-5 bg-secondary/60">
              <CardContent className="flex items-center gap-3">
                <HeartHandshake className="size-7 shrink-0 text-primary" />
                <Text small>
                  Clear shares. Fewer reminders.
                  <br />
                  <strong>A happier home.</strong>
                </Text>
              </CardContent>
            </Card>
          </div>
        </section>
        <section className="flex flex-col gap-8 py-8">
          <div className="flex flex-col gap-2">
            <Eyebrow>Less admin. More living.</Eyebrow>
            <Heading level={2} className="text-3xl">
              The small things, sorted.
            </Heading>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: House,
                title: "Your bills have a home.",
                description:
                  "See what’s coming up, what’s overdue, and what’s already paid. No buried group-chat messages.",
              },
              {
                icon: Users,
                title: "A fair share for everyone.",
                description:
                  "Split equally or set custom amounts. Everyone can see their part and mark it paid.",
              },
              {
                icon: Repeat2,
                title: "Ready for next month.",
                description:
                  "Set monthly bills once. New bills appear automatically, and your payment history stays intact.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <Card key={title}>
                <CardHeader>
                  <Icon className="mb-4 size-6 text-primary" />
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-8 sm:px-12">
        <Brand />
        <Text small muted>
          For the people you share a roof with.
        </Text>
      </footer>
    </div>
  );
}
