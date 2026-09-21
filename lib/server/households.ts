import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, type Transaction } from "@/lib/db";
import { households, invitations, members, profiles } from "@/lib/db/schema";
import { DomainError } from "@/lib/domain/bills";
import {
  householdSchema,
  idSchema,
  invitationSchema,
} from "@/lib/domain/validation";
import type { Identity } from "./auth";
import { appUrl } from "./environment";
export async function syncProfile(tx: Transaction, user: Identity) {
  await tx
    .insert(profiles)
    .values({ id: user.id, name: user.name, email: user.email })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { name: user.name, email: user.email },
    });
}
export async function membershipFor(user: Identity) {
  const [member] = await getDb()
    .select()
    .from(members)
    .where(eq(members.userId, user.id))
    .limit(1);
  return member;
}
export async function inHousehold<T>(
  user: Identity,
  householdId: string,
  run: (tx: Transaction, member: typeof members.$inferSelect) => Promise<T>,
  options: { snapshot?: boolean } = {},
): Promise<T> {
  idSchema.parse(householdId);
  return getDb().transaction(
    async (tx) => {
      const [member] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.userId, user.id),
            eq(members.householdId, householdId),
          ),
        )
        .for("share");
      if (!member)
        throw new DomainError(
          "This household is not available to your account.",
        );
      await tx.execute(
        sql`select set_config('app.user_id', ${user.id}, true), set_config('app.household_id', ${householdId}, true)`,
      );
      return run(tx, member);
    },
    { isolationLevel: options.snapshot ? "repeatable read" : "read committed" },
  );
}
export function requireOwner(member: typeof members.$inferSelect) {
  if (member.role !== "owner")
    throw new DomainError("Only the household owner can do that.");
}
export async function createHousehold(user: Identity, input: unknown) {
  const value = householdSchema.parse(input);
  return getDb().transaction(async (tx) => {
    await syncProfile(tx, user);
    await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .for("update");
    const [existing] = await tx
      .select()
      .from(members)
      .where(eq(members.userId, user.id));
    if (existing) throw new DomainError("You already belong to a household.");
    const [household] = await tx.insert(households).values(value).returning();
    await tx
      .insert(members)
      .values({ householdId: household.id, userId: user.id, role: "owner" });
    return household.id;
  });
}
export async function updateHousehold(
  user: Identity,
  householdId: string,
  input: unknown,
) {
  const value = householdSchema.parse(input);
  return inHousehold(user, householdId, async (tx, member) => {
    requireOwner(member);
    await tx
      .update(households)
      .set(value)
      .where(eq(households.id, householdId));
  });
}
export async function inviteMember(
  user: Identity,
  householdId: string,
  input: unknown,
) {
  const { email } = invitationSchema.parse(input);
  const origin = appUrl();
  const token = randomBytes(32).toString("hex");
  await inHousehold(user, householdId, async (tx, member) => {
    requireOwner(member);
    await tx
      .select()
      .from(households)
      .where(eq(households.id, householdId))
      .for("update");
    const current = await tx
      .select()
      .from(members)
      .innerJoin(profiles, eq(members.userId, profiles.id))
      .where(eq(members.householdId, householdId));
    if (current.length >= 30)
      throw new DomainError("A household can have up to 30 roommates.");
    if (current.some((m) => m.profiles.email === email))
      throw new DomainError("That roommate is already in your household.");
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.householdId, householdId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    await tx.insert(invitations).values({
      householdId,
      email,
      invitedBy: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
  });
  return `${origin}/join/${token}`;
}
export async function acceptInvitation(user: Identity, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new DomainError("This invitation is invalid or expired.");
  if (!user.emailVerified)
    throw new DomainError(
      "Verify your email before accepting this invitation.",
    );
  return getDb().transaction(async (tx) => {
    await syncProfile(tx, user);
    await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .for("update");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [candidate] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash));
    if (!candidate || candidate.email !== user.email)
      throw new DomainError(
        "This invitation is expired or belongs to a different email address.",
      );
    // Use the same household → invitation lock order as replacement invitations.
    // Re-read under lock so concurrent revocation/replacement cannot be bypassed.
    await tx
      .select()
      .from(households)
      .where(eq(households.id, candidate.householdId))
      .for("update");
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.householdId, candidate.householdId),
          eq(invitations.tokenHash, tokenHash),
        ),
      )
      .for("update");
    if (
      !invite ||
      invite.revokedAt ||
      invite.expiresAt < new Date() ||
      invite.email !== user.email
    )
      throw new DomainError(
        "This invitation is expired or belongs to a different email address.",
      );
    const [existing] = await tx
      .select()
      .from(members)
      .where(eq(members.userId, user.id));
    if (existing?.householdId === invite.householdId) return invite.householdId;
    if (existing)
      throw new DomainError("You already belong to another household.");
    if (invite.acceptedAt)
      throw new DomainError("This invitation has already been used.");

    const count = await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.householdId, invite.householdId));
    if (count.length >= 30) throw new DomainError("This household is full.");
    await tx
      .insert(members)
      .values({ householdId: invite.householdId, userId: user.id });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));
    return invite.householdId;
  });
}
export async function listInvitations(user: Identity, householdId: string) {
  return inHousehold(user, householdId, async (tx, member) => {
    requireOwner(member);
    return tx
      .select({
        id: invitations.id,
        email: invitations.email,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.householdId, householdId),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
  });
}
export async function revokeInvitation(
  user: Identity,
  householdId: string,
  id: string,
) {
  idSchema.parse(id);
  return inHousehold(user, householdId, async (tx, member) => {
    requireOwner(member);
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.householdId, householdId),
          eq(invitations.id, id),
          isNull(invitations.acceptedAt),
        ),
      );
  });
}
