"use client";
import { HouseholdSwitcher, type HouseholdOption } from "./household-switcher";
import { AnimatedIcon } from "@/components/icons/animated-icon";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "./ui/motion";
import { usePathname } from "next/navigation";
import { Users, House } from "lucide-react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/typography";
import { signOut } from "@/lib/server/actions";
import type { HouseholdData } from "@/lib/domain/types";
const links = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/bills", label: "Bills", icon: "receipt-text" },
  { href: "/household", label: "Household", icon: "users" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
export function AppShell({
  data,
  demo = false,
  households = [],
  children,
}: {
  data: Pick<HouseholdData, "household" | "viewer" | "members">;
  demo?: boolean;
  households?: HouseholdOption[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  const reduced = useReducedMotion();
  const prefix = demo ? "/demo" : "";
  const active = (href: string) =>
    path === `${prefix}${href}` ||
    (href === "/bills" && path.startsWith(`${prefix}/bills/`)) ||
    (demo && path === "/demo" && href === "/dashboard");
  const nav = links.map(({ href, label, icon }) => (
    <Button
      key={href}
      variant={active(href) ? "secondary" : "ghost"}
      asChild
      className="h-12 justify-start gap-3 px-4"
    >
      <Link
        href={`${prefix}${href}`}
        aria-current={active(href) ? "page" : undefined}
      >
        <AnimatedIcon name={icon} data-icon="inline-start" />
        <span>{label}</span>
      </Link>
    </Button>
  ));
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-background focus:p-4"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border/60 bg-card p-5 lg:flex">
        <Brand />
        <Separator className="my-7" />
        <Card size="sm">
          <CardHeader>
            <CardDescription>Your shared space</CardDescription>
            <CardTitle className="min-w-0">
              {demo ? (
                data.household.name
              ) : (
                <HouseholdSwitcher
                  households={households}
                  activeId={data.household.id}
                />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">
              <Users data-icon="inline-start" />
              {data.members.length} roommate
              {data.members.length !== 1 ? "s" : ""}
            </Badge>
          </CardContent>
        </Card>
        <nav aria-label="Main navigation" className="mt-8 flex flex-col gap-2">
          {nav}
        </nav>
        <div className="mt-auto flex flex-col gap-5">
          <Text muted small>
            A happy home starts with
            <br />
            being on the same page.
          </Text>
          <Separator />
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>{data.viewer.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Text small className="font-medium">
                {data.viewer.name}
              </Text>
              <Text muted small>
                {demo ? "Demo household" : "Your account"}
              </Text>
            </div>
            {!demo && (
              <form action={signOut}>
                <Button size="icon" variant="ghost" aria-label="Sign out">
                  <AnimatedIcon name="log-out" />
                </Button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex min-h-18 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-5 sm:px-9">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
            <House className="size-4" />
            {data.household.name}
          </div>
          <div className="flex items-center gap-2">
            {demo && (
              <>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  Demo
                </Badge>
                <Button size="sm" asChild>
                  <Link href="/sign-up">
                    <span className="sm:hidden">Join</span>
                    <span className="hidden sm:inline">Make it yours</span>
                    <AnimatedIcon
                      name="arrow-up-right"
                      data-icon="inline-end"
                    />
                  </Link>
                </Button>
              </>
            )}
            <ThemeToggle />
            <Avatar className="hidden sm:flex">
              <AvatarFallback>{data.viewer.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
          </div>
        </header>
        {!demo && (
          <div className="flex min-w-0 border-b border-border/60 px-3 py-2 lg:hidden">
            <HouseholdSwitcher
              households={households}
              activeId={data.household.id}
            />
          </div>
        )}
        <main
          id="main-content"
          className="mx-auto flex w-full max-w-6xl px-5 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-9 sm:pt-10 lg:pb-10"
        >
          <Reveal
            key={path}
            className="flex w-full min-w-0 flex-col gap-7 sm:gap-8"
          >
            {children}
          </Reveal>
        </main>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t border-border/70 bg-card/95 px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
      >
        {links.map(({ href, label, icon }) => (
          <Button
            key={href}
            asChild
            variant="ghost"
            className="relative isolate h-auto min-h-14 flex-col gap-1 rounded-2xl px-1 py-2"
          >
            <Link
              href={`${prefix}${href}`}
              aria-current={active(href) ? "page" : undefined}
            >
              {active(href) && (
                <motion.span
                  aria-hidden
                  layoutId={reduced ? undefined : "mobile-nav"}
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  className="absolute inset-x-1 inset-y-0 -z-10 rounded-2xl bg-secondary"
                />
              )}
              <AnimatedIcon
                name={icon}
                className={
                  active(href) ? "text-primary" : "text-muted-foreground"
                }
              />
              <span
                className={
                  active(href)
                    ? "text-[11px] font-semibold text-primary"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {label}
              </span>
            </Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}
