"use client";

import Link from "next/link";
import { signOut } from "@/lib/server/actions";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({
  name,
  email,
  demo = false,
}: {
  name: string;
  email: string;
  demo?: boolean;
}) {
  const prefix = demo ? "/demo" : "";
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full p-0"
          aria-label="Open account menu"
        >
          <Avatar aria-hidden="true">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 max-w-[calc(100vw-1rem)] p-2"
      >
        <DropdownMenuLabel className="px-2 py-2 font-normal">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg" aria-hidden="true">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {demo ? "Demo household" : email}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`${prefix}/dashboard`}>
              <AnimatedIcon name="home" data-icon="inline-start" />
              Home
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`${prefix}/household`}>
              <AnimatedIcon name="users" data-icon="inline-start" />
              Household
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`${prefix}/settings`}>
              <AnimatedIcon name="settings" data-icon="inline-start" />
              Settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {demo ? (
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href="/sign-up">
                <AnimatedIcon name="arrow-up-right" data-icon="inline-start" />
                Make it yours
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            <form action={signOut}>
              <DropdownMenuItem asChild variant="destructive">
                <button type="submit" className="flex w-full items-center">
                  <AnimatedIcon name="log-out" data-icon="inline-start" />
                  Log out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
