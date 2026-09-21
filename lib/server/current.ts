import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { householdsFor } from "./households";
import { generateForUser } from "./recurrence";
import { readHousehold } from "./queries";
import { cookies } from "next/headers";
import {
  ACTIVE_HOUSEHOLD_COOKIE,
  selectHousehold,
} from "@/lib/domain/navigation";
export const currentHouseholds = cache(async () =>
  householdsFor(await requireUser()),
);
export const currentHousehold = cache(async () => {
  const user = await requireUser();
  const member = selectHousehold(
    await currentHouseholds(),
    (await cookies()).get(ACTIVE_HOUSEHOLD_COOKIE)?.value,
  );
  if (!member) redirect("/onboarding");
  await generateForUser(user, member.id);
  return readHousehold(user, member.id);
});
