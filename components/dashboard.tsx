import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CalendarDays,
  CircleAlert,
  ReceiptText,
  Users,
  HeartHandshake,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Heading, Text, Eyebrow } from "@/components/ui/typography";
import { Separator } from "@/components/ui/separator";
import { BillDialog } from "./bill-form";
import { CategoryIcon, StatusBadge } from "./bill-card";
import { dateLabel, money } from "@/lib/domain/bills";
import type { HouseholdData } from "@/lib/domain/types";
export function Dashboard({
  data,
  demo = false,
}: {
  data: HouseholdData;
  demo?: boolean;
}) {
  const { bills, today, viewer, household, members } = data;
  const prefix = demo ? "/demo" : "";
  const month = today.slice(0, 7);
  const thisMonth = bills.filter((b) => b.dueDate.startsWith(month));
  const total = thisMonth.reduce((s, b) => s + b.amountCents, 0);
  const paid = thisMonth.reduce((s, b) => s + b.paidCents, 0);
  const overdue = bills.filter((b) => b.status === "overdue");
  const overdueAmount = overdue.reduce(
    (s, b) => s + b.amountCents - b.paidCents,
    0,
  );
  const ownRemaining = bills
    .flatMap((b) => b.splits)
    .filter((s) => s.memberId === viewer.id)
    .reduce((s, b) => s + b.amountCents - b.paidCents, 0);
  const upcoming = bills
    .filter((b) => b.status !== "paid" && b.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const priority = [
    ...overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    ...upcoming,
  ].slice(0, 5);
  const recent = data.payments.filter((p) => !p.reversedAt).slice(0, 4);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Your home, in harmony</Eyebrow>
          <Heading>Hey {viewer.name.split(" ")[0]}, welcome home.</Heading>
          <Text muted>Let’s take a little bill stress off your plate.</Text>
        </div>
        <BillDialog
          householdId={household.id}
          members={members}
          today={today}
          demo={demo}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
        <Card className="bg-primary text-primary-foreground ring-0">
          <CardHeader>
            <CardDescription className="text-primary-foreground/75">
              THE HOUSEHOLD THIS MONTH
            </CardDescription>
            <CardAction>
              <Badge
                variant="outline"
                className="border-primary-foreground/25 text-primary-foreground"
              >
                <CalendarDays data-icon="inline-start" />
                {monthLabel}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <Text className="text-5xl font-medium tracking-tight tabular-nums sm:text-6xl">
                {money(total - paid)}
              </Text>
              <Text className="mt-2 text-primary-foreground/75">
                left to pay this month
              </Text>
            </div>
            <div className="flex flex-col gap-3">
              <Progress
                value={total ? (paid / total) * 100 : 0}
                aria-label="This month’s payment progress"
                className="bg-primary-foreground/20 [&_[data-slot=progress-indicator]]:bg-primary-foreground"
              />
              <div className="flex flex-wrap justify-between gap-2">
                <Text small className="text-primary-foreground/80">
                  {money(paid)} paid of {money(total)}
                </Text>
                <Text small className="text-primary-foreground/80">
                  {total ? Math.round((paid / total) * 100) : 0}% sorted
                </Text>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your little corner</CardTitle>
            <CardDescription>
              Just your shares, across all open bills.
            </CardDescription>
            <CardAction>
              <Avatar size="lg">
                <AvatarFallback>{viewer.name[0]}</AvatarFallback>
              </Avatar>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Text className="text-4xl font-medium tracking-tight tabular-nums">
                {money(ownRemaining)}
              </Text>
              <Text muted small>
                your remaining share
              </Text>
            </div>
            <Button variant="outline" asChild className="w-full">
              <Link href={`${prefix}/bills?filter=unpaid`}>
                Let’s get it sorted
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            label: "Due this month",
            value: money(total),
            note: `${thisMonth.length} household bills`,
            icon: ReceiptText,
          },
          {
            label: "Already paid",
            value: money(paid),
            note: "A little peace of mind",
            icon: Check,
          },
          {
            label: "Still to pay",
            value: money(total - paid),
            note: "For this month’s bills",
            icon: CalendarDays,
          },
          {
            label: "Overdue",
            value: money(overdueAmount),
            note: `${overdue.length} bill${overdue.length !== 1 ? "s" : ""} needs attention`,
            icon: CircleAlert,
          },
        ].map(({ label, value, note, icon: Icon }) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardAction>
                <Icon className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <Text className="text-2xl font-semibold tracking-tight tabular-nums">
                {value}
              </Text>
              <Text small muted className="mt-1">
                {note}
              </Text>
            </CardContent>
          </Card>
        ))}
      </div>
      {overdue.length > 0 && (
        <Alert>
          <CircleAlert className="text-destructive" />
          <AlertTitle>A quick heads-up</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {overdue.length === 1
                  ? overdue[0].name
                  : `${overdue.length} bills`}{" "}
                {overdue.length === 1 ? "has" : "have"} an unpaid share past the
                due date. {money(overdueAmount)} is still outstanding.
              </span>
              <Button variant="link" size="sm" asChild>
                <Link href={`${prefix}/bills?filter=overdue`}>
                  Take a look
                  <ArrowUpRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Coming up at home</CardTitle>
            <CardDescription>
              A little heads-up goes a long way.
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`${prefix}/bills`}>
                  All bills
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {priority.length ? (
              priority.map((bill, i) => (
                <div key={bill.id}>
                  {i > 0 && <Separator className="mb-5" />}
                  <div className="flex items-center gap-3">
                    <CategoryIcon category={bill.category} />
                    <div className="min-w-0 flex-1">
                      <Button
                        variant="link"
                        asChild
                        className="h-auto justify-start p-0"
                      >
                        <Link href={`${prefix}/bills/${bill.id}`}>
                          {bill.name}
                        </Link>
                      </Button>
                      <Text muted small>
                        Due {dateLabel(bill.dueDate)}
                      </Text>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Text className="font-semibold tabular-nums">
                        {money(bill.amountCents - bill.paidCents)}
                      </Text>
                      <StatusBadge status={bill.status} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Check />
                  </EmptyMedia>
                  <EmptyTitle>
                    {bills.length
                      ? "You’re all caught up."
                      : "A fresh start for your home."}
                  </EmptyTitle>
                  <EmptyDescription>
                    {bills.length
                      ? "No outstanding bills. Enjoy the breathing room."
                      : "Add a bill to see what’s coming up."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Around the house</CardTitle>
              <CardDescription>
                Recent payments from your people.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {recent.length ? (
                recent.map((p) => (
                  <div key={p.id} className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback>{p.memberName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <Text small>
                        <span className="font-medium">{p.memberName}</span> paid{" "}
                        {money(p.amountCents)}
                      </Text>
                      <Text small muted>
                        {p.billName} · {dateLabel(p.recordedAt.slice(0, 10))}
                      </Text>
                    </div>
                    <Check className="mt-1 size-4 text-primary" />
                  </div>
                ))
              ) : (
                <Text small muted>
                  Once a roommate marks a share as paid, you’ll see it here.
                </Text>
              )}
            </CardContent>
          </Card>
          <Card className="bg-secondary/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HeartHandshake className="size-5" />
                Better together.
              </CardTitle>
              <CardDescription>
                Everyone can see their share. No spreadsheet detective work
                required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href={`${prefix}/household`}>
                  <Users data-icon="inline-start" />
                  Your household
                  <ArrowUpRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
