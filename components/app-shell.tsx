"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  Users,
  Settings,
  House,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
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
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/bills", label: "Bills", icon: ReceiptText },
  { href: "/household", label: "Household", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({
  data,
  demo = false,
  children,
}: {
  data: Pick<HouseholdData, "household" | "viewer" | "members">;
  demo?: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const prefix = demo ? "/demo" : "";
  const nav = links.map(({ href, label, icon: Icon }) => (
    <Button
      key={href}
      variant={
        path === `${prefix}${href}` ||
        (href === "/bills" && path.startsWith(`${prefix}/bills/`)) ||
        (demo && path === "/demo" && href === "/dashboard")
          ? "secondary"
          : "ghost"
      }
      asChild
      className="justify-start"
    >
      <Link href={`${prefix}${href}`}>
        <Icon data-icon="inline-start" />
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
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card p-5 lg:flex">
        <Brand />
        <Separator className="my-7" />
        <Card size="sm">
          <CardHeader>
            <CardDescription>Your shared space</CardDescription>
            <CardTitle>{data.household.name}</CardTitle>
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
                  <LogOut />
                </Button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b bg-background/95 px-5 sm:px-9">
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
                    <ArrowUpRight data-icon="inline-end" />
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
        <main
          id="main-content"
          className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 pb-28 sm:px-9 sm:py-10 lg:pb-10"
        >
          {children}
        </main>
      </div>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 gap-1 border-t bg-card px-2 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {links.map(({ href, label, icon: Icon }) => (
          <Button
            key={href}
            asChild
            variant={
              path.startsWith(`${prefix}${href}`) ||
              (demo && path === "/demo" && href === "/dashboard")
                ? "secondary"
                : "ghost"
            }
            className="h-auto flex-col gap-1 px-1 py-2"
          >
            <Link href={`${prefix}${href}`}>
              <Icon />
              <span className="text-xs">{label}</span>
            </Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}
