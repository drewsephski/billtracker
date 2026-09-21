import { AnimatedIcon } from "@/components/icons/animated-icon";
import Link from "next/link";
import { LockKeyhole, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Heading, Text } from "@/components/ui/typography";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CategoryIcon, StatusBadge } from "./bill-card";
import { BillDialog } from "./bill-form";
import { PaymentActions } from "./payment-actions";
import type { HouseholdData, BillView } from "@/lib/domain/types";
import {
  money,
  dateLabel,
  canEditBill,
  canManageShare,
} from "@/lib/domain/bills";
export function BillDetail({
  data,
  bill,
  demo = false,
}: {
  data: HouseholdData;
  bill: BillView;
  demo?: boolean;
}) {
  const editable = canEditBill(
    data.viewer.role,
    data.viewer.userId,
    bill.createdBy,
    bill.hasPaymentHistory,
  );
  const history = data.payments.filter((p) => p.billId === bill.id);
  return (
    <>
      <div>
        <Button asChild variant="ghost">
          <Link href={`${demo ? "/demo" : ""}/bills`}>
            <AnimatedIcon name="arrow-left" data-icon="inline-start" />
            All bills
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <CategoryIcon category={bill.category} />
          <div className="flex min-w-0 flex-col gap-2">
            <Heading>{bill.name}</Heading>
            <Text muted>
              Due {dateLabel(bill.dueDate, true)} · {bill.category}
            </Text>
          </div>
        </div>
        {editable && (
          <BillDialog
            householdId={data.household.id}
            members={data.members}
            today={data.today}
            bill={bill}
            demo={demo}
          />
        )}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <Card>
            <CardHeader>
              <CardDescription>Total bill</CardDescription>
              <CardTitle className="text-4xl tabular-nums">
                {money(bill.amountCents)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusBadge status={bill.status} />
              <Progress
                value={(bill.paidCents / bill.amountCents) * 100}
                aria-label="Amount paid"
              />
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <Text small muted>
                  Paid {money(bill.paidCents)}
                </Text>
                <Text small className="font-medium">
                  {money(bill.amountCents - bill.paidCents)} left
                </Text>
              </div>
              {bill.templateId && (
                <Text muted small className="flex items-center gap-2">
                  <AnimatedIcon name="refresh-cw" className="size-4" />
                  Part of a monthly bill
                </Text>
              )}
              {bill.notes && (
                <>
                  <Separator />
                  <Text small>{bill.notes}</Text>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="order-2 lg:order-1">
          <CardHeader>
            <CardTitle>Everyone’s share</CardTitle>
            <CardDescription>
              Mark a share as paid once the money has been settled.
            </CardDescription>
          </CardHeader>
          <CardContent className="@container flex flex-col gap-5">
            {bill.splits.map((share, i) => (
              <div key={share.id}>
                {i > 0 && <Separator className="mb-5" />}
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 @min-[440px]:grid-cols-[auto_minmax(0,1fr)_auto_7rem] @min-[440px]:gap-x-5">
                  <Avatar size="lg">
                    <AvatarFallback>{share.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Text className="break-words font-medium">
                      {share.name}
                      {share.memberId === data.viewer.id ? " (you)" : ""}
                    </Text>
                    <Text small muted>
                      {share.paidCents >= share.amountCents
                        ? "All settled"
                        : share.paidCents > 0
                          ? `${money(share.paidCents)} paid · ${money(share.amountCents - share.paidCents)} left`
                          : "Still to pay"}
                    </Text>
                  </div>
                  <Text className="whitespace-nowrap text-right text-lg font-semibold tabular-nums">
                    {money(share.amountCents)}
                  </Text>
                  {share.amountCents === 0 ? (
                    <Badge
                      variant="success"
                      className="col-span-2 col-start-2 justify-self-end @min-[440px]:col-span-1 @min-[440px]:col-start-auto"
                    >
                      No share due
                    </Badge>
                  ) : canManageShare(
                      data.viewer.role,
                      data.viewer.id,
                      share.memberId,
                    ) ? (
                    <PaymentActions
                      householdId={data.household.id}
                      billId={bill.id}
                      splitId={share.id}
                      paymentId={share.paymentId}
                      canPay={share.paidCents < share.amountCents}
                      undoLabel={
                        share.activePaymentCount > 1 ||
                        share.paidCents < share.amountCents
                          ? "Undo latest"
                          : "Undo"
                      }
                      name={share.name}
                      demo={demo}
                    />
                  ) : (
                    <Badge
                      variant={
                        share.paidCents >= share.amountCents
                          ? "success"
                          : "outline"
                      }
                      className="col-span-2 col-start-2 justify-self-end @min-[440px]:col-span-1 @min-[440px]:col-start-auto"
                    >
                      {share.paidCents >= share.amountCents
                        ? "Paid"
                        : share.paidCents > 0
                          ? "Partly paid"
                          : "Unpaid"}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Disclosure
        title="About recording payments"
        className="rounded-2xl px-5"
        triggerClassName="font-normal text-muted-foreground"
      >
        <Text small muted>
          Settle up however you usually do, then record the payment here. No
          money is transferred by homeshare.
        </Text>
        {bill.hasPaymentHistory && (
          <Alert>
            <LockKeyhole />
            <AlertDescription>
              This bill has payment history, so its amount and shares are
              locked. Recurring settings can still be changed for future bills.
            </AlertDescription>
          </Alert>
        )}
      </Disclosure>
      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
          <CardDescription>
            A clear record of who marked each share as paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {history.length ? (
            history.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <Text small>
                    <strong>{p.memberName}</strong> · {money(p.amountCents)}
                    {p.reversedAt ? " · Undone" : " paid"}
                  </Text>
                  <Text small muted>
                    Recorded by {p.recordedByName} on{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: data.household.timeZone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(p.recordedAt))}
                  </Text>
                </div>
                {p.reversedAt && <Badge variant="outline">Reversed</Badge>}
              </div>
            ))
          ) : (
            <Text muted small>
              No payments recorded yet. Each roommate’s payment will appear
              here.
            </Text>
          )}
        </CardContent>
      </Card>
    </>
  );
}
