import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { membershipFor } from "./households";
import { generateForUser } from "./recurrence";
import { readHousehold } from "./queries";
export const currentHousehold = cache(async () => {
  const user = await requireUser();
  const member = await membershipFor(user);
  if (!member) redirect("/onboarding");
  await generateForUser(user, member.householdId);
  return readHousehold(user, member.householdId);
});
