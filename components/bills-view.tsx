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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Eyebrow>Under one roof</Eyebrow>
          <Heading>Shared bills.</Heading>
          <Text muted>Who’s paid. What’s next.</Text>
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
        viewerId={data.viewer.id}
        today={data.today}
        demo={demo}
        initialFilter={
          ["all", "mine", "upcoming", "unpaid", "overdue", "paid"].includes(
            filter,
          )
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
          <CardContent className="@container flex flex-col gap-5">
            {data.templates.map((t, i) => (
              <div key={t.id}>
                {i > 0 && <Separator className="mb-5" />}
                <div
                  role="group"
                  aria-label={`${t.name} recurring bill`}
                  className="grid items-center gap-4 @min-[540px]:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <CategoryIcon category={t.category} />
                    <div className="min-w-0 flex-1">
                      <Text className="font-medium">{t.name}</Text>
                      <Text muted small>
                        {t.active
                          ? `Next bill: ${dateLabel(t.nextDueDate, true)}`
                          : "Paused · no new bills will be generated"}
                      </Text>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 @min-[540px]:gap-6">
                    <div className="flex min-w-0 flex-col items-start gap-1.5">
                      <Text className="font-semibold tabular-nums">
                        {money(t.amountCents)}
                      </Text>
                      <Badge variant="outline">
                        {t.active ? "Monthly" : "Paused"}
                      </Badge>
                    </div>
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
