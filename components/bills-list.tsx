"use client";
import { useState } from "react";
import { Search, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { BillCard } from "./bill-card";
import type { BillView } from "@/lib/domain/types";
export function BillsList({
  bills,
  today,
  demo = false,
  initialFilter = "all",
}: {
  bills: BillView[];
  today: string;
  demo?: boolean;
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [search, setSearch] = useState("");
  const filtered = bills
    .filter(
      (b) =>
        (filter === "all" ||
          (filter === "unpaid"
            ? b.status !== "paid"
            : filter === "upcoming"
              ? b.dueDate >= today && b.status !== "paid"
              : b.status === filter)) &&
        b.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.status === "paid" ? 1 : 0) - (b.status === "paid" ? 1 : 0) ||
        a.dueDate.localeCompare(b.dueDate),
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="flex h-auto flex-wrap justify-start">
            {["all", "upcoming", "unpaid", "overdue", "paid"].map((f) => (
              <TabsTrigger key={f} value={f}>
                {f[0].toUpperCase() + f.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Search bills"
            placeholder="Find a bill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full xl:w-56"
          />
        </div>
      </div>
      {filtered.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => (
            <BillCard key={b.id} bill={b} today={today} demo={demo} />
          ))}
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptText />
            </EmptyMedia>
            <EmptyTitle>
              {bills.length
                ? "Nothing here. That’s a good thing."
                : "Your shared bills start here."}
            </EmptyTitle>
            <EmptyDescription>
              {bills.length
                ? "No bills match this view. Try a different filter or search."
                : "Add your first bill and we’ll help you keep track of everyone’s share."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
