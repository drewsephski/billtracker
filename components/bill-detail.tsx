import Link from "next/link";
import { ArrowLeft, LockKeyhole, Repeat2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { PaymentButton } from "./payment-button";
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
            <ArrowLeft data-icon="inline-start" />
            All bills
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CategoryIcon category={bill.category} />
          <div className="flex flex-col gap-2">
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
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Everyone’s share</CardTitle>
            <CardDescription>
              Mark a share as paid once the money has been settled.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {bill.splits.map((share, i) => (
              <div key={share.id}>
                {i > 0 && <Separator className="mb-5" />}
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{share.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Text className="font-medium">
                      {share.name}
                      {share.memberId === data.viewer.id ? " (you)" : ""}
                    </Text>
                    <Text small muted>
                      {share.paidCents >= share.amountCents
                        ? "All settled"
                        : "Still to pay"}
                    </Text>
                  </div>
                  <Text className="text-xl font-semibold tabular-nums">
                    {money(share.amountCents)}
                  </Text>
                  {share.amountCents === 0 ? (
                    <Badge variant="success">No share due</Badge>
                  ) : canManageShare(
                      data.viewer.role,
                      data.viewer.id,
                      share.memberId,
                    ) ? (
                    <PaymentButton
                      householdId={data.household.id}
                      billId={bill.id}
                      splitId={share.id}
                      paymentId={share.paymentId}
                      name={share.name}
                      demo={demo}
                    />
                  ) : (
                    <Badge variant={share.paymentId ? "success" : "outline"}>
                      {share.paymentId ? "Paid" : "Unpaid"}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
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
              <div className="flex justify-between">
                <Text small muted>
                  Paid {money(bill.paidCents)}
                </Text>
                <Text small className="font-medium">
                  {money(bill.amountCents - bill.paidCents)} left
                </Text>
              </div>
              {bill.templateId && (
                <Text muted small className="flex items-center gap-2">
                  <Repeat2 className="size-4" />
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
          {bill.hasPaymentHistory && (
            <Alert>
              <LockKeyhole />
              <AlertDescription>
                This bill has payment history, so its amount and shares are
                locked. Recurring settings can still be changed for future
                bills.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
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
                <CheckCircle2 className="size-5 text-muted-foreground" />
                <div className="flex-1">
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
