import Link from "next/link";
import { Users, ShieldCheck } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heading, Text, Eyebrow } from "@/components/ui/typography";
import { Separator } from "@/components/ui/separator";
import { InviteForm, RevokeButton } from "./account-forms";
import type { HouseholdData } from "@/lib/domain/types";
export function HouseholdView({
  data,
  demo = false,
  invitations = [],
}: {
  data: HouseholdData;
  demo?: boolean;
  invitations?: { id: string; email: string; expiresAt: Date }[];
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Eyebrow>Your people</Eyebrow>
        <Heading>Home is a team effort.</Heading>
        <Text muted>
          {data.household.name} · {data.members.length} roommates
        </Text>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Under one roof
            </CardTitle>
            <CardDescription>
              Everyone here can see your shared bills and payment history.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {data.members.map((m, i) => (
              <div key={m.id}>
                {i > 0 && <Separator className="mb-5" />}
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{m.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Text className="font-medium">
                      {m.name}
                      {m.id === data.viewer.id && " (you)"}
                    </Text>
                    <Text muted small className="truncate">
                      {m.email}
                    </Text>
                  </div>
                  <Badge variant={m.role === "owner" ? "secondary" : "outline"}>
                    {m.role === "owner" ? "Owner" : "Roommate"}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Room for one more?</CardTitle>
            <CardDescription>
              Invite a roommate so they can see and settle their share.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {demo ? (
              <Button asChild>
                <Link href="/sign-up">Create your own household</Link>
              </Button>
            ) : data.viewer.role === "owner" ? (
              <InviteForm householdId={data.household.id} />
            ) : (
              <Text muted small>
                Ask your household owner to create an invitation link.
              </Text>
            )}
          </CardContent>
        </Card>
      </div>
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Open invitations</CardTitle>
            <CardDescription>Links are valid for seven days.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {invitations.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <Text small>{invite.email}</Text>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {invite.expiresAt < new Date() ? "Expired" : "Pending"}
                  </Badge>
                  <RevokeButton
                    householdId={data.household.id}
                    id={invite.id}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Text small muted className="flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0" />
        Your household is private. Only accepted roommates can see its bills.
      </Text>
    </>
  );
}
