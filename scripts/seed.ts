import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb } from "../lib/db";
import { members } from "../lib/db/schema";
import {
  createHousehold,
  inviteMember,
  acceptInvitation,
  membershipFor,
} from "../lib/server/households";
import { saveBill, recordPayment } from "../lib/server/bills";
import { readHousehold } from "../lib/server/queries";
import { todayInZone } from "../lib/domain/bills";
import type { Identity } from "../lib/server/auth";
loadEnvConfig(process.cwd());
async function main() {
  if (
    process.env.SEED_ALLOWED !== "true" ||
    process.env.VERCEL_ENV === "production"
  )
    throw new Error(
      "Seed only a development Neon branch with SEED_ALLOWED=true.",
    );
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is required.");
  if (existsSync(".env.seed")) {
    console.log(
      "Seed credentials already exist in .env.seed. No changes made.",
    );
    return;
  }
  const password = randomBytes(24).toString("base64url");
  const people: Identity[] = [];
  const suffix = randomBytes(4).toString("hex");
  for (const name of ["Sarah", "Emma", "Olivia"]) {
    const email = `${name.toLowerCase()}.${suffix}@example.com`;
    const response = await fetch(`${baseUrl}/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: process.env.APP_URL || "http://localhost:3000",
      },
      body: JSON.stringify({ email, password, name }),
    });
    if (!response.ok)
      throw new Error(`Development user setup failed (${response.status}).`);
    const body = await response.json();
    if (!body.user?.id) throw new Error("Neon Auth did not return a user.");
    people.push({ id: body.user.id, email, name, emailVerified: true });
    // Development fixtures only: no email is sent to reserved example.com addresses.
    // Never run against production. The app itself has no verification bypass.
    await getDb().execute(
      sql`update neon_auth."user" set "emailVerified" = true where id = ${body.user.id}`,
    );
  }
  const [sarah, emma, olivia] = people;
  const householdId = await createHousehold(sarah, {
    name: "Lake Street Apartment",
    timeZone: "America/Chicago",
  });
  for (const person of [emma, olivia]) {
    const link = await inviteMember(sarah, householdId, {
      email: person.email,
    });
    await acceptInvitation(person, link.split("/").at(-1)!);
  }
  const group = await getDb()
    .select()
    .from(members)
    .where(eq(members.householdId, householdId));
  const today = todayInZone("America/Chicago");
  const offset = (days: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000)
      .toISOString()
      .slice(0, 10);
  for (const [name, amount, dueDate, paidCount] of [
    ["Rent", "2400.00", `${today.slice(0, 7)}-01`, 3],
    ["Electricity", "186.42", offset(3), 2],
    ["Internet", "75.00", offset(7), 0],
    ["Gas", "92.40", offset(-4), 1],
  ] as const) {
    const billId = await saveBill(sarah, householdId, {
      name,
      category: name,
      amount,
      dueDate,
      memberIds: group.map((m) => m.id),
      splitMode: "equal",
      recurring: true,
    });
    const bill = (await readHousehold(sarah, householdId)).bills.find(
      (b) => b.id === billId,
    )!;
    for (const person of people.slice(0, paidCount)) {
      const member = await membershipFor(person, householdId);
      await recordPayment(
        sarah,
        householdId,
        billId,
        bill.splits.find((s) => s.memberId === member!.id)!.id,
      );
    }
  }
  writeFileSync(
    ".env.seed",
    `SEED_SARAH_EMAIL=${sarah.email}\nSEED_EMMA_EMAIL=${emma.email}\nSEED_OLIVIA_EMAIL=${olivia.email}\nSEED_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Seeded Lake Street Apartment with Sarah, Emma and Olivia. Development login credentials are in .env.seed (gitignored).",
  );
}
main()
  .finally(closeDb)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  });
