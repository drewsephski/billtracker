import Link from "next/link";
import {
  House,
  Zap,
  Wifi,
  Flame,
  Droplets,
  ShoppingBasket,
  ReceiptText,
  Repeat2,
  ArrowUpRight,
  Check,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
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
  demo = false,
}: {
  bill: BillView;
  today: string;
  demo?: boolean;
}) {
  const overdue = bill.status === "overdue";
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex items-center justify-between gap-2">
          <CategoryIcon category={bill.category} />
          <StatusBadge status={bill.status} />
        </div>
        <CardTitle>
          <Button variant="link" asChild className="h-auto justify-start p-0">
            <Link
              href={`${demo ? "/demo" : ""}/bills/${bill.id}`}
              className="text-lg"
            >
              {bill.name}
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardTitle>
        <CardDescription>
          {overdue
            ? `${daysBetween(bill.dueDate, today)} days overdue · `
            : "Due "}
          {dateLabel(bill.dueDate)}
        </CardDescription>
        <CardAction>
          <Text className="text-2xl font-semibold tracking-tight tabular-nums">
            {money(bill.amountCents)}
          </Text>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {bill.splits.map((s) => (
          <div key={s.id} className="flex items-center gap-2.5">
            <Avatar size="sm">
              <AvatarFallback>{s.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <Text small className="min-w-0 flex-1 truncate">
              {s.name}
            </Text>
            <Text small className="tabular-nums">
              {money(s.amountCents)}
            </Text>
            <Badge
              variant={s.paidCents >= s.amountCents ? "success" : "outline"}
            >
              {s.paidCents >= s.amountCents ? "Paid" : "Unpaid"}
            </Badge>
          </div>
        ))}
        <Progress
          value={(bill.paidCents / bill.amountCents) * 100}
          aria-label={`${money(bill.paidCents)} of ${money(bill.amountCents)} paid`}
          className="mt-2"
        />
        <Text small muted>
          {money(bill.paidCents)} of {money(bill.amountCents)} paid
        </Text>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Text small muted className="flex items-center gap-1.5">
          {bill.templateId && <Repeat2 className="size-3.5" />}
          {bill.templateId ? "Monthly" : "One-time"}
        </Text>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`${demo ? "/demo" : ""}/bills/${bill.id}`}>
            View bill
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
