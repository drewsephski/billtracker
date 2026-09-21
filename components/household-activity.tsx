import Link from "next/link";
import { ActivityChat } from "./activity-chat";
import { AnimatedIcon } from "./icons/animated-icon";
import { Button } from "./ui/button";
import type { HouseholdData } from "@/lib/domain/types";

export function HouseholdActivity({
  data,
  demo = false,
}: {
  data: HouseholdData;
  demo?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <ActivityChat
        key={data.household.id}
        householdId={data.household.id}
        householdName={data.household.name}
        today={data.today}
        demo={demo}
      />
      <div className="flex justify-end">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="min-h-11 text-muted-foreground"
        >
          <Link href={demo ? "/demo/chat" : "/chat"}>
            Open group chat
            <AnimatedIcon name="chevron-right" data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
