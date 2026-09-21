import { AnimatedIcon } from "@/components/icons/animated-icon";
import Link from "next/link";
import {
  House,
  Zap,
  Wifi,
  Flame,
  Droplets,
  ShoppingBasket,
  ReceiptText,
  Check,
  Circle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Text } from "@/components/ui/typography";
import {
  dateLabel,
  daysBetween,
  money,
  type BillStatus,
  type Category,
} from "@/lib/domain/bills";
import type { BillView } from "@/lib/domain/types";
const icons = {
  Rent: House,
  Electricity: Zap,
  Internet: Wifi,
  Gas: Flame,
  Water: Droplets,
  Household: ShoppingBasket,
  Other: ReceiptText,
};
export function CategoryIcon({ category }: { category: Category }) {
  const Icon = icons[category] || ReceiptText;
  return (
    <Avatar size="lg">
      <AvatarFallback>
        <Icon className="size-5" />
      </AvatarFallback>
    </Avatar>
  );
}
export function StatusBadge({ status }: { status: BillStatus }) {
  return (
    <Badge
      variant={
        status === "paid"
          ? "success"
          : status === "overdue"
            ? "destructive"
            : status === "partially paid"
              ? "warning"
              : "outline"
      }
    >
      {status === "paid" && <Check data-icon="inline-start" />}
      {status[0].toUpperCase() + status.slice(1)}
    </Badge>
  );
}
export function BillCard({
  bill,
  today,
  viewerId,
  demo = false,
}: {
  bill: BillView;
  today: string;
  viewerId?: string;
  demo?: boolean;
}) {
  const overdue = bill.status === "overdue";
  const settled = bill.splits.filter(
    (share) => share.paidCents >= share.amountCents,
  ).length;
  return (
    <Card className="action-surface">
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between gap-2">
          <CategoryIcon category={bill.category} />
          <StatusBadge status={bill.status} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>
              <Button
                variant="link"
                asChild
                className="h-auto min-h-0 justify-start p-0 text-base font-semibold text-foreground"
              >
                <Link href={`${demo ? "/demo" : ""}/bills/${bill.id}`}>
                  <span className="truncate">{bill.name}</span>
                  <AnimatedIcon name="arrow-up-right" data-icon="inline-end" />
                </Link>
              </Button>
            </CardTitle>
            <CardDescription
              className={overdue ? "mt-1 text-destructive" : "mt-1"}
            >
              {overdue
                ? `${daysBetween(bill.dueDate, today)} days overdue`
                : `Due ${dateLabel(bill.dueDate)}`}
            </CardDescription>
          </div>
          <Text className="shrink-0 text-2xl font-semibold tracking-tight tabular-nums">
            {money(bill.amountCents)}
          </Text>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-muted/60 p-3.5 space-y-3">
          {bill.splits.map((share) => (
            <div key={share.id} className="flex items-center gap-2.5">
              <Avatar size="sm">
                <AvatarFallback>{share.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <Text small className="min-w-0 flex-1 truncate">
                {share.memberId === viewerId ? "You" : share.name}
              </Text>
              <Text small className="font-medium tabular-nums">
                {money(share.amountCents)}
              </Text>
              {share.paidCents >= share.amountCents ? (
                <Check className="size-4 text-primary" aria-label="Paid" />
              ) : (
                <Circle
                  className="size-4 text-muted-foreground/40"
                  aria-label="Unpaid"
                />
              )}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Progress
            value={
              bill.amountCents ? (bill.paidCents / bill.amountCents) * 100 : 0
            }
            aria-label={`${money(bill.paidCents)} of ${money(bill.amountCents)} paid`}
          />
          <div className="flex justify-between gap-2">
            <Text small muted>
              {settled} of {bill.splits.length} settled
            </Text>
            <Text small muted>
              {money(bill.amountCents - bill.paidCents)} left
            </Text>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2 py-2.5">
        <Text small muted className="flex items-center gap-1.5">
          {bill.templateId && (
            <AnimatedIcon name="refresh-cw" className="size-3.5" />
          )}
          {bill.templateId ? "Monthly" : "One-time"}
        </Text>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`${demo ? "/demo" : ""}/bills/${bill.id}`}>
            View bill
            <AnimatedIcon name="arrow-up-right" data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
