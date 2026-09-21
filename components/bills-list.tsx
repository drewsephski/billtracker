"use client";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Reveal } from "./ui/motion";
import { FriendlyState } from "./friendly-state";
import { BillCard } from "./bill-card";
import type { BillView } from "@/lib/domain/types";
const filters = [
  { value: "all", label: "All bills" },
  { value: "mine", label: "Your shares" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];
export function BillsList({
  bills,
  today,
  viewerId,
  demo = false,
  initialFilter = "all",
}: {
  bills: BillView[];
  today: string;
  viewerId?: string;
  demo?: boolean;
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState("");
  const filtered = bills
    .filter(
      (bill) =>
        (filter === "all" ||
          (filter === "mine"
            ? bill.splits.some(
                (share) =>
                  share.memberId === viewerId &&
                  share.paidCents < share.amountCents,
              )
            : filter === "unpaid"
              ? bill.status !== "paid"
              : filter === "upcoming"
                ? bill.dueDate >= today && bill.status !== "paid"
                : bill.status === filter)) &&
        bill.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.status === "paid" ? 1 : 0) - (b.status === "paid" ? 1 : 0) ||
        a.dueDate.localeCompare(b.dueDate),
    );
  const visibleFilters = ["unpaid", "upcoming"].includes(filter)
    ? [
        ...filters,
        { value: filter, label: filter === "unpaid" ? "Unpaid" : "Upcoming" },
      ]
    : filters;
  return (
    <Tabs value={filter} onValueChange={setFilter} className="gap-5">
      <div className="relative">
        <Search
          aria-hidden
          className="absolute left-4 top-4 size-4 text-muted-foreground"
        />
        <Input
          aria-label="Search bills"
          placeholder="Find a bill…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="bg-card pr-12 pl-11"
        />
        {search && (
          <Button
            aria-label="Clear search"
            size="icon"
            variant="ghost"
            onClick={() => setSearch("")}
            className="absolute right-1 top-0.5"
          >
            <AnimatedIcon name="x" />
          </Button>
        )}
      </div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList aria-label="Filter bills" className="w-full">
          {visibleFilters.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="px-2 text-xs sm:px-4 sm:text-sm"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div aria-live="polite" className="sr-only">
        {filtered.length} {filtered.length === 1 ? "bill" : "bills"} found
      </div>
      <TabsContent value={filter}>
        <Reveal key={filter}>
          {filtered.length ? (
            <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((bill) => (
                <BillCard
                  key={bill.id}
                  bill={bill}
                  today={today}
                  viewerId={viewerId}
                  demo={demo}
                />
              ))}
            </div>
          ) : (
            <FriendlyState
              variant={
                !search &&
                bills.length > 0 &&
                (filter === "mine" || filter === "overdue")
                  ? "chat"
                  : "receipt"
              }
              title={
                search
                  ? "No bills by that name."
                  : !bills.length
                    ? "Your shared bills start here."
                    : filter === "overdue"
                      ? "No overdue bills. Breathe easy."
                      : filter === "mine"
                        ? "Your shares are all settled."
                        : "A little quiet here."
              }
              description={
                search
                  ? "Try another name, or clear your search to see your bills."
                  : !bills.length
                    ? "Add your first bill and give everyone’s share a home."
                    : "You’re up to date with this view. See all bills for the full picture."
              }
            >
              {(search || filter !== "all") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  See all bills
                </Button>
              )}
            </FriendlyState>
          )}
        </Reveal>
      </TabsContent>
    </Tabs>
  );
}
