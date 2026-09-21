import { AnimatedIcon } from "@/components/icons/animated-icon";
import Link from "next/link";
import { Check, CircleAlert, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heading, Text } from "@/components/ui/typography";

import { GettingStarted } from "./getting-started";
import { BillDialog } from "./bill-form";
import { CategoryIcon, StatusBadge } from "./bill-card";
import { Blob } from "./blob";
import { FriendlyState } from "./friendly-state";
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
  const thisMonth = bills.filter((b) =>
    b.dueDate.startsWith(today.slice(0, 7)),
  );
  const total = thisMonth.reduce((sum, bill) => sum + bill.amountCents, 0);
  const paid = thisMonth.reduce((sum, bill) => sum + bill.paidCents, 0);
  const overdue = bills.filter((bill) => bill.status === "overdue");
  const ownRemaining = bills
    .flatMap((bill) => bill.splits)
    .filter((share) => share.memberId === viewer.id)
    .reduce((sum, share) => sum + share.amountCents - share.paidCents, 0);
  const priority = bills
    .filter((bill) => bill.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  const recent = data.payments
    .filter((payment) => !payment.reversedAt)
    .slice(0, 3);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Heading className="text-[1.75rem] leading-tight sm:text-4xl">
            Hey {viewer.name.split(" ")[0]},<br className="sm:hidden" /> welcome
            home.
          </Heading>
          <Text muted className="hidden sm:block">
            A little less admin. A little more living.
          </Text>
        </div>
        <BillDialog
          householdId={household.id}
          members={members}
          today={today}
          demo={demo}
        />
      </div>
      {!demo && data.viewer.role === "owner" && (
        <GettingStarted key={household.id} data={data} />
      )}
      <section
        aria-label="Your balance"
        className="balance-surface grid grid-cols-[minmax(0,1fr)_28%] items-center gap-x-5 gap-y-6 overflow-hidden rounded-[1.75rem] p-5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:p-8"
      >
        <div className="min-w-0 space-y-2">
          <Text small className="font-medium">
            Your share to settle
          </Text>
          <Text className="text-[2.75rem] font-medium leading-tight tracking-[-0.05em] tabular-nums sm:text-6xl">
            {money(ownRemaining)}
          </Text>
          <Text small className="max-w-44 text-inherit/75 sm:max-w-none">
            {ownRemaining
              ? "Across your unpaid household bills."
              : "You’re all caught up. Make yourself at home."}
          </Text>
        </div>
        <Blob
          variant={ownRemaining ? "coins" : "chat"}
          priority
          sizes="(max-width: 640px) 28vw, 224px"
          className="w-full sm:row-span-2"
        />
        <Button
          asChild
          className="col-span-2 justify-self-start bg-foreground text-background hover:bg-foreground/90 sm:col-span-1"
        >
          <Link href={`${prefix}/bills?filter=mine`}>
            {ownRemaining ? "See your shares" : "Explore your bills"}
            <AnimatedIcon name="arrow-right" data-icon="inline-end" />
          </Link>
        </Button>
      </section>
      {!demo && (
        <Link
          href="/chat"
          className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-5 transition-colors hover:bg-secondary/50"
        >
          <div>
            <Heading level={2} className="text-lg">
              House Chat
            </Heading>
            <Text small muted>
              Your housemates, your bills, and a little help from Homeshare.
            </Text>
          </div>
          <span className="shrink-0 text-sm font-medium text-primary">
            Open chat →
          </span>
        </Link>
      )}
      <section aria-label="Household this month" className="space-y-3 px-1">
        <div className="flex items-center justify-between gap-3">
          <Text small className="font-medium">
            {monthLabel} at home
          </Text>
          <Text small muted>
            {total ? Math.round((paid / total) * 100) : 0}% settled
          </Text>
        </div>
        <Progress
          value={total ? (paid / total) * 100 : 0}
          aria-label="This month’s payment progress"
        />
        <div className="flex flex-wrap justify-between gap-2">
          <Text small muted>
            <span className="font-medium text-foreground">{money(paid)}</span>{" "}
            paid
          </Text>
          <Text small muted>
            <span className="font-medium text-foreground">
              {money(total - paid)}
            </span>{" "}
            left for everyone
          </Text>
        </div>
      </section>
      <div className="grid items-start gap-8 xl:grid-cols-[1.5fr_1fr]">
        <section
          className="min-w-0 space-y-4"
          aria-labelledby="attention-heading"
        >
          <div className="flex items-center justify-between">
            <Heading level={2} id="attention-heading">
              Up next
            </Heading>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${prefix}/bills`}>
                All bills
                <AnimatedIcon name="arrow-right" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          {overdue.length > 0 && (
            <Link
              href={`${prefix}/bills?filter=overdue`}
              className="action-surface flex items-center gap-3 rounded-2xl bg-destructive/5 px-4 py-3 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            >
              <CircleAlert className="size-4 shrink-0" />
              <span className="flex-1">
                {overdue.length} household{" "}
                {overdue.length === 1 ? "bill needs" : "bills need"} a little
                attention
              </span>
              <AnimatedIcon name="arrow-up-right" className="size-4 shrink-0" />
            </Link>
          )}
          {priority.length ? (
            <Card className="gap-0 py-0">
              {priority.map((bill) => {
                const share = bill.splits.find(
                  (split) => split.memberId === viewer.id,
                );
                return (
                  <Link
                    key={bill.id}
                    href={`${prefix}/bills/${bill.id}`}
                    className="bill-row action-surface flex items-center gap-3 border-b border-border/60 p-4 last:border-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:p-5"
                  >
                    <CategoryIcon category={bill.category} />
                    <div className="min-w-0 flex-1">
                      <Text className="truncate font-medium">{bill.name}</Text>
                      <Text small muted>
                        Due {dateLabel(bill.dueDate)}
                        <span className="hidden sm:inline">
                          {" "}
                          · {money(bill.amountCents)} total
                        </span>
                      </Text>
                      <div className="mt-2">
                        <StatusBadge status={bill.status} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Text className="font-semibold tabular-nums">
                        {money(
                          share
                            ? share.amountCents - share.paidCents
                            : bill.amountCents - bill.paidCents,
                        )}
                      </Text>
                      <Text small muted>
                        {share
                          ? share.paidCents >= share.amountCents
                            ? "you’re settled"
                            : "your share"
                          : "remaining"}
                      </Text>
                    </div>
                    <AnimatedIcon
                      name="arrow-up-right"
                      className="hidden size-4 text-muted-foreground sm:block"
                    />
                  </Link>
                );
              })}
            </Card>
          ) : (
            <FriendlyState
              variant={bills.length ? "chat" : "receipt"}
              title={
                bills.length
                  ? "All settled. Nice feeling, right?"
                  : "A fresh start for your home."
              }
              description={
                bills.length
                  ? "Nothing left to pay. Your next household bills will appear here."
                  : "Add your first bill above, then everyone can see their share."
              }
            />
          )}
        </section>
        <section
          className="min-w-0 space-y-4"
          aria-labelledby="activity-heading"
        >
          <div className="flex min-h-11 items-center justify-between">
            <Heading level={2} id="activity-heading">
              Recently settled
            </Heading>
            <Check className="size-4 text-primary" />
          </div>
          {recent.length ? (
            <div className="space-y-5 px-1 py-2">
              {recent.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{payment.memberName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Text small className="truncate font-medium">
                      {payment.memberName} paid {money(payment.amountCents)}
                    </Text>
                    <Text small muted className="truncate">
                      {payment.billName}
                    </Text>
                  </div>
                  <Badge variant="success">
                    <Check className="size-3" />
                    <span className="sr-only">Paid</span>
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <Text small muted className="py-3">
              A little quiet for now. Your household’s payments will appear
              here.
            </Text>
          )}
          <Card className="mt-6 bg-secondary/50 ring-0" size="sm">
            <CardContent className="flex items-center gap-3">
              <Users className="size-5 shrink-0 text-primary" />
              <div className="flex-1">
                <Text small className="font-medium">
                  Better under one roof.
                </Text>
                <Text small muted>
                  {members.length}{" "}
                  {members.length === 1 ? "roommate" : "roommates"}, one shared
                  space.
                </Text>
              </div>
              <Button asChild variant="ghost" size="icon">
                <Link href={`${prefix}/household`} aria-label="Your household">
                  <AnimatedIcon name="arrow-up-right" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
