"use client";
import Link from "next/link";
import { useActionState } from "react";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/typography";
import { Feedback } from "./feedback";
import { switchHouseholdAction } from "@/lib/server/actions";
export type HouseholdOption = {
  id: string;
  name: string;
  role: "owner" | "member";
};
export function HouseholdSwitcher({
  households,
  activeId,
}: {
  households: HouseholdOption[];
  activeId: string;
}) {
  const path = usePathname();
  const [state, action, pending] = useActionState(
    async (
      previous: import("@/lib/domain/types").ActionResult,
      form: FormData,
    ) => {
      window.dispatchEvent(new Event("homeshare:switch-start"));
      try {
        return await switchHouseholdAction(previous, form);
      } finally {
        window.dispatchEvent(new Event("homeshare:switch-end"));
      }
    },
    {},
  );
  const active = households.find((home) => home.id === activeId);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={`Switch household, current: ${active?.name}`}
          className="min-w-0 max-w-full justify-between gap-2 px-2"
        >
          <AnimatedIcon name="home" className="text-primary" />
          <span className="truncate">{active?.name}</span>
          <AnimatedIcon name="chevron-down" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-2"
      >
        <Text small muted className="px-3 py-2">
          Your households
        </Text>
        <form action={action} className="max-h-64 overflow-y-auto">
          <input
            type="hidden"
            name="returnTo"
            value={path === "/chat" ? "/chat" : "/dashboard"}
          />
          {households.map((home) => (
            <Button
              key={home.id}
              type="submit"
              name="householdId"
              value={home.id}
              disabled={pending || home.id === activeId}
              variant="ghost"
              className="h-auto min-h-14 w-full justify-start rounded-xl px-3 text-left disabled:opacity-100"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{home.name}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {home.role === "owner" ? "Owner" : "Member"}
                </span>
              </span>
              {home.id === activeId && <Check className="text-primary" />}
            </Button>
          ))}
        </form>
        <Feedback state={state} />
        <Separator className="my-2" />
        <Button asChild variant="ghost" className="w-full justify-start">
          <Link href="/onboarding?new=1">
            <AnimatedIcon name="plus" />
            Create a household
          </Link>
        </Button>
        <Text small muted className="px-3 py-2">
          Joining another home? Open your roommate’s invite link.
        </Text>
      </PopoverContent>
    </Popover>
  );
}
