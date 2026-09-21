import { Heading, Text, Eyebrow } from "@/components/ui/typography";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BillDialog } from "./bill-form";
import { BillsList } from "./bills-list";
import { CategoryIcon } from "./bill-card";
import { dateLabel, money } from "@/lib/domain/bills";
import type { HouseholdData } from "@/lib/domain/types";
export function BillsView({
  data,
  demo = false,
  filter = "all",
}: {
  data: HouseholdData;
  demo?: boolean;
  filter?: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>A place for everything</Eyebrow>
          <Heading>The bills, all together.</Heading>
          <Text muted>What’s due, what’s paid, and who’s sharing what.</Text>
        </div>
        <BillDialog
          householdId={data.household.id}
          members={data.members}
          today={data.today}
          demo={demo}
        />
      </div>
      <BillsList
        key={filter}
        bills={data.bills}
        today={data.today}
        demo={demo}
        initialFilter={
          ["all", "upcoming", "unpaid", "overdue", "paid"].includes(filter)
            ? filter
            : "all"
        }
      />
      {data.templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>On repeat</CardTitle>
            <CardDescription>
              Your monthly bills, taken care of ahead of time. Changing a
              recurring bill only affects future instances.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {data.templates.map((t, i) => (
              <div key={t.id}>
                {i > 0 && <Separator className="mb-5" />}
                <div className="flex flex-wrap items-center gap-3">
                  <CategoryIcon category={t.category} />
                  <div className="min-w-0 flex-1">
                    <Text className="font-medium">{t.name}</Text>
                    <Text muted small>
                      {t.active
                        ? `Next ungenerated bill: ${dateLabel(t.nextDueDate, true)}`
                        : "Paused · no new bills will be generated"}
                    </Text>
                  </div>
                  <Badge variant="outline">
                    {t.active ? "Monthly" : "Paused"}
                  </Badge>
                  <Text className="font-semibold tabular-nums">
                    {money(t.amountCents)}
                  </Text>
                  {data.viewer.role === "owner" && (
                    <BillDialog
                      householdId={data.household.id}
                      members={data.members}
                      today={data.today}
                      template={t}
                      demo={demo}
                    />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
