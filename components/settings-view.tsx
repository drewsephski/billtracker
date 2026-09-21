import { AnimatedIcon } from "@/components/icons/animated-icon";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heading, Text, Eyebrow } from "@/components/ui/typography";
import { HouseholdForm } from "./account-forms";
import { ThemePreferenceControl } from "./theme-toggle";
import { signOut } from "@/lib/server/actions";
import type { HouseholdData } from "@/lib/domain/types";
export function SettingsView({
  data,
  demo = false,
}: {
  data: HouseholdData;
  demo?: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Eyebrow>Make yourself comfortable</Eyebrow>
        <Heading>The little details.</Heading>
        <Text muted>Your household and account settings.</Text>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your household</CardTitle>
            <CardDescription>
              {data.viewer.role === "owner"
                ? "A few details that keep everyone on the same page."
                : "Your household owner manages these settings."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HouseholdForm
              household={data.household}
              readOnly={demo || data.viewer.role !== "owner"}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your account</CardTitle>
              <CardDescription>{data.viewer.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-3">
              <Text>{data.viewer.name}</Text>
              <Badge variant="secondary">
                {data.viewer.role === "owner" ? "Household owner" : "Roommate"}
              </Badge>
              {!demo && (
                <>
                  <Button asChild variant="outline">
                    <Link href="/verify-email">Verify email</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/forgot-password">Reset password</Link>
                  </Button>
                  <form action={signOut}>
                    <Button variant="ghost">
                      <AnimatedIcon name="log-out" />
                      Sign out
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Light or cozy?</CardTitle>
              <CardDescription>
                Follows your device by default. Your light or dark preference is
                saved on this device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemePreferenceControl />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>A note about payments</CardTitle>
            </CardHeader>
            <CardContent>
              <Text muted small>
                Homeshare keeps a record of what’s been paid. Settle up however
                you usually do, then mark your share here. No bank accounts or
                money transfers involved.
              </Text>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
