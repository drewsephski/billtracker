"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateLabel } from "@/lib/domain/bills";

// Date objects belong only to the calendar UI. Submit the original DATE shape,
// without UTC conversion that could move the selected day across time zones.
function calendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DatePicker({
  id,
  name,
  defaultValue,
  today,
}: {
  id: string;
  name: string;
  defaultValue: string;
  today: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const selected = calendarDate(value);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-description={dateLabel(value, true)}
            title={dateLabel(value, true)}
            className="h-11 w-full min-w-0 justify-between gap-2 rounded-[0.8rem] bg-transparent px-3 text-sm font-normal"
          >
            <span className="truncate">{dateLabel(value)}</span>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          aria-label="Choose due date"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current
              ?.querySelector<HTMLButtonElement>(
                'button[data-selected-single="true"]',
              )
              ?.focus();
          }}
          align="end"
          collisionPadding={12}
          sideOffset={8}
          className="minimal-scrollbar z-[60] max-h-(--radix-popover-content-available-height) w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-3"
        >
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected}
            today={calendarDate(today)}
            onSelect={(date) => {
              setValue(dateValue(date));
              setOpen(false);
            }}
            startMonth={calendarDate("2000-01-01")}
            endMonth={calendarDate("2100-12-31")}
            disabled={{
              before: calendarDate("2000-01-01"),
              after: calendarDate("2100-12-31"),
            }}
            captionLayout="dropdown"
            autoFocus
            className="w-full p-0"
            classNames={{ root: "w-full" }}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
