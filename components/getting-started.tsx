"use client";
import Link from "next/link";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { BillDialog } from "./bill-form";
import type { HouseholdData } from "@/lib/domain/types";
import {
  gettingStartedProgress,
  type GettingStartedProgress,
} from "@/lib/client/getting-started";

const memory = new Map<string, GettingStartedProgress>();
function readProgress(key: string) {
  try {
    const value = localStorage.getItem(key);
    if (
      value === "both" ||
      value === "invite" ||
      value === "bill" ||
      value === "complete"
    )
      return value;
  } catch {
    /* Private browsing can disable storage. */
  }
  return memory.get(key) ?? null;
}
function subscribe(callback: () => void) {
  window.addEventListener("getting-started-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("getting-started-change", callback);
    window.removeEventListener("storage", callback);
  };
}

export function GettingStarted({ data }: { data: HouseholdData }) {
  const key = `homeshare-start:${data.viewer.userId}:${data.household.id}`;
  const memberCount = data.members.length;
  const billCount = data.bills.length;
  const initial = gettingStartedProgress(memberCount, billCount, null);
  const snapshot = useCallback(
    () => gettingStartedProgress(memberCount, billCount, readProgress(key)),
    [key, memberCount, billCount],
  );
  const progress = useSyncExternalStore(subscribe, snapshot, () => initial);
  useEffect(() => {
    if (!progress) return;
    memory.set(key, progress);
    try {
      localStorage.setItem(key, progress);
    } catch {
      /* Keep progress in memory. */
    }
    window.dispatchEvent(new Event("getting-started-change"));
  }, [key, progress]);
  if (!progress || progress === "complete") return null;
  return (
    <Card className="bg-secondary/40 ring-0" size="sm">
      <CardContent>
        <section aria-label="Getting started" className="space-y-4">
          <div className="space-y-1">
            <Heading level={2}>Make this home yours.</Heading>
            <Text small muted>
              A shared space for your people and bills.
            </Text>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(progress === "both" || progress === "invite") &&
              data.viewer.role === "owner" && (
                <Button asChild variant="outline" className="justify-start">
                  <Link href="/household#invite">
                    <AnimatedIcon name="users" />
                    Invite a roommate
                  </Link>
                </Button>
              )}
            {(progress === "both" || progress === "bill") && (
              <BillDialog
                householdId={data.household.id}
                members={data.members}
                today={data.today}
                triggerLabel="Add your first bill"
              />
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
