import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, closeDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  acceptInvitation,
  createHousehold,
  inviteMember,
  membershipFor,
  householdsFor,
  invitationPreview,
  updateHousehold,
  revokeInvitation,
} from "@/lib/server/households";
import { saveBill, recordPayment, updateTemplate } from "@/lib/server/bills";
import { readHousehold } from "@/lib/server/queries";
import { generateInTransaction } from "@/lib/server/recurrence";
import type { Identity } from "@/lib/server/auth";
if (process.env.RUN_DB_TESTS === "1") process.loadEnvFile(".env.local");
loadEnvConfig(process.cwd());
const enabled = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!enabled)(
  "real Postgres tenant boundaries and transactional lifecycle",
  () => {
    const suffix = randomUUID();
    const owner: Identity = {
      id: `test-owner-${suffix}`,
      name: "Test Owner",
      email: `owner-${suffix}@example.com`,
      emailVerified: true,
    };
    const roommate: Identity = {
      id: `test-roommate-${suffix}`,
      name: "Test Roommate",
      email: `roommate-${suffix}@example.com`,
      emailVerified: true,
    };
    const outsider: Identity = {
      id: `test-outsider-${suffix}`,
      name: "Test Outsider",
      email: `outsider-${suffix}@example.com`,
      emailVerified: true,
    };
    const pendingUser: Identity = {
      id: `test-pending-${suffix}`,
      name: "Test Pending",
      email: `pending-${suffix}@example.com`,
      emailVerified: true,
    };
    const additionalHomes: string[] = [];
    let householdId: string;
    let otherHousehold: string;
    let ownerMember: string;
    let roommateMember: string;
    let outsiderMember: string;
    const input = (extra: Record<string, unknown> = {}) => ({
      name: "Test electricity",
      category: "Electricity",
      amount: "100.01",
      dueDate: "2027-01-31",
      splitMode: "equal",
      memberIds: [ownerMember, roommateMember],
      recurring: false,
      notes: "",
      ...extra,
    });
    beforeAll(async () => {
      if (process.env.SEED_ALLOWED !== "true")
        throw new Error(
          "Integration tests require an explicitly designated development database (SEED_ALLOWED=true).",
        );
      householdId = await createHousehold(owner, {
        name: "Integration household",
        timeZone: "America/Chicago",
      });
      otherHousehold = await createHousehold(outsider, {
        name: "Other test household",
        timeZone: "UTC",
      });
      const url = await inviteMember(owner, householdId, {
        email: roommate.email,
      });
      const token = url.split("/").at(-1)!;
      expect(
        await Promise.all([
          acceptInvitation(roommate, token),
          acceptInvitation(roommate, token),
        ]),
      ).toEqual([householdId, householdId]);
      ownerMember = (await membershipFor(owner, householdId))!.id;
      roommateMember = (await membershipFor(roommate, householdId))!.id;
      outsiderMember = (await membershipFor(outsider, otherHousehold))!.id;
    });
    afterAll(async () => {
      const ids = [householdId, otherHousehold, ...additionalHomes].filter(
        Boolean,
      );
      if (ids.length)
        await getDb().transaction(async (tx) => {
          await tx
            .delete(schema.payments)
            .where(inArray(schema.payments.householdId, ids));
          await tx
            .delete(schema.splits)
            .where(inArray(schema.splits.householdId, ids));
          await tx
            .delete(schema.bills)
            .where(inArray(schema.bills.householdId, ids));
          await tx
            .delete(schema.templateSplits)
            .where(inArray(schema.templateSplits.householdId, ids));
          await tx
            .delete(schema.templates)
            .where(inArray(schema.templates.householdId, ids));
          await tx
            .delete(schema.invitations)
            .where(inArray(schema.invitations.householdId, ids));
          await tx
            .delete(schema.members)
            .where(inArray(schema.members.householdId, ids));
          await tx
            .delete(schema.households)
            .where(inArray(schema.households.id, ids));
          await tx
            .delete(schema.profiles)
            .where(
              inArray(schema.profiles.id, [
                owner.id,
                roommate.id,
                outsider.id,
                pendingUser.id,
              ]),
            );
        });
      await closeDb();
    });
    it("denies household enumeration and bill creation by an outsider", async () => {
      await expect(readHousehold(outsider, householdId)).rejects.toThrow(
        "not available",
      );
      await expect(saveBill(outsider, householdId, input())).rejects.toThrow(
        "not available",
      );
    });
    it("cannot substitute foreign bill or split IDs while using a valid household membership", async () => {
      const id = await saveBill(owner, householdId, input());
      const ownId = await saveBill(
        outsider,
        otherHousehold,
        input({ memberIds: [outsiderMember] }),
      );
      const bill = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.id === id,
      )!;
      await expect(
        saveBill(
          outsider,
          otherHousehold,
          input({ memberIds: [outsiderMember] }),
          { id, version: 1 },
        ),
      ).rejects.toThrow("Bill not found");
      await expect(
        recordPayment(outsider, otherHousehold, id, bill.splits[0].id),
      ).rejects.toThrow("Bill not found");
      await expect(
        recordPayment(outsider, otherHousehold, ownId, bill.splits[0].id),
      ).rejects.toThrow("own share");
      expect(
        (await readHousehold(outsider, otherHousehold)).bills.some(
          (b) => b.id === id,
        ),
      ).toBe(false);
    });
    it("rejects foreign member IDs and rolls back a malformed custom split", async () => {
      await expect(
        saveBill(
          owner,
          householdId,
          input({ memberIds: [ownerMember, outsiderMember] }),
        ),
      ).rejects.toThrow("this household");
      await expect(
        saveBill(
          owner,
          householdId,
          input({
            splitMode: "custom",
            customAmounts: { [ownerMember]: "50", [roommateMember]: "50" },
          }),
        ),
      ).rejects.toThrow("add up");
    });
    it("database composite foreign keys prevent cross-tenant shares", async () => {
      const id = await saveBill(owner, householdId, input());
      await expect(
        getDb()
          .update(schema.splits)
          .set({ memberId: outsiderMember })
          .where(
            and(
              eq(schema.splits.householdId, householdId),
              eq(schema.splits.billId, id),
              eq(schema.splits.memberId, ownerMember),
            ),
          ),
      ).rejects.toThrow();
    });
    it("database deferred balance checks reject corrupt amounts", async () => {
      const id = await saveBill(owner, householdId, input());
      await expect(
        getDb()
          .update(schema.bills)
          .set({ amountCents: 1 })
          .where(eq(schema.bills.id, id)),
      ).rejects.toThrow();
    });
    it("records each share once under concurrency, protects others, and preserves reversals", async () => {
      const id = await saveBill(owner, householdId, input());
      let bill = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.id === id,
      )!;
      const own = bill.splits.find((s) => s.memberId === ownerMember)!;
      const other = bill.splits.find((s) => s.memberId === roommateMember)!;
      await expect(
        recordPayment(roommate, householdId, id, own.id),
      ).rejects.toThrow("own share");
      await expect(
        recordPayment(outsider, householdId, id, own.id),
      ).rejects.toThrow("not available");
      await Promise.all([
        recordPayment(owner, householdId, id, own.id),
        recordPayment(owner, householdId, id, own.id),
      ]);
      bill = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.id === id,
      )!;
      expect(bill.paidCents).toBe(own.amountCents);
      expect(bill.status).toBe("partially paid");
      await expect(
        saveBill(owner, householdId, input({ amount: "200" }), {
          id,
          version: 1,
        }),
      ).rejects.toThrow("payment history");
      await recordPayment(roommate, householdId, id, other.id);
      bill = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.id === id,
      )!;
      expect(bill.status).toBe("paid");
      const paymentId = bill.splits.find((s) => s.id === own.id)!.paymentId!;
      await recordPayment(owner, householdId, id, own.id, paymentId);
      await recordPayment(owner, householdId, id, own.id);
      // A delayed undo for an old payment must not reverse its replacement.
      await recordPayment(owner, householdId, id, own.id, paymentId);
      const data = await readHousehold(owner, householdId);
      expect(data.bills.find((b) => b.id === id)!.status).toBe("paid");
      expect(
        data.payments.filter((p) => p.billId === id && p.reversedAt),
      ).toHaveLength(1);
    });
    it("rejects stale edits and roommate edits to another creator’s bill", async () => {
      const id = await saveBill(owner, householdId, input());
      await expect(
        saveBill(roommate, householdId, input(), { id, version: 1 }),
      ).rejects.toThrow("creator");
      await saveBill(owner, householdId, input({ amount: "120" }), {
        id,
        version: 1,
      });
      await expect(
        saveBill(owner, householdId, input(), { id, version: 1 }),
      ).rejects.toThrow("changed");
    });
    it("generates a monthly period once and snapshots template changes", async () => {
      const id = await saveBill(owner, householdId, input({ recurring: true }));
      const first = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.id === id,
      )!;
      await Promise.all([
        getDb().transaction((tx) =>
          generateInTransaction(tx, householdId, "2027-02-28"),
        ),
        getDb().transaction((tx) =>
          generateInTransaction(tx, householdId, "2027-02-28"),
        ),
      ]);
      let data = await readHousehold(owner, householdId);
      expect(
        data.bills.filter((b) => b.templateId === first.templateId),
      ).toHaveLength(2);
      const template = data.templates.find((t) => t.id === first.templateId)!;
      await updateTemplate(
        owner,
        householdId,
        template.id,
        template.version,
        input({ amount: "200.00" }),
        true,
      );
      await getDb().transaction((tx) =>
        generateInTransaction(tx, householdId, "2027-03-31"),
      );
      data = await readHousehold(owner, householdId);
      const series = data.bills.filter(
        (b) => b.templateId === first.templateId,
      );
      expect(series.find((b) => b.dueDate === "2027-02-28")!.amountCents).toBe(
        10001,
      );
      expect(series.find((b) => b.dueDate === "2027-03-31")!.amountCents).toBe(
        20000,
      );
      expect(series.find((b) => b.id === id)!.amountCents).toBe(10001);
      const current = data.templates.find((t) => t.id === template.id)!;
      await updateTemplate(
        owner,
        householdId,
        current.id,
        current.version,
        input({ amount: "200.00" }),
        false,
      );
      expect(
        await getDb().transaction((tx) =>
          generateInTransaction(tx, householdId, "2027-05-31"),
        ),
      ).toBe(0);
    });
    it("binds invitations to verified email, expires/revokes links and restricts owners", async () => {
      await expect(
        inviteMember(roommate, householdId, { email: pendingUser.email }),
      ).rejects.toThrow("owner");
      const url = await inviteMember(owner, householdId, {
        email: pendingUser.email,
      });
      const token = url.split("/").at(-1)!;
      await expect(
        acceptInvitation({ ...pendingUser, emailVerified: false }, token),
      ).rejects.toThrow("Verify");
      await expect(acceptInvitation(outsider, token)).rejects.toThrow(
        "different email",
      );
      const [invite] = await getDb()
        .select()
        .from(schema.invitations)
        .where(
          and(
            eq(schema.invitations.householdId, householdId),
            eq(schema.invitations.email, pendingUser.email),
          ),
        );
      await getDb()
        .update(schema.invitations)
        .set({ expiresAt: new Date(0) })
        .where(eq(schema.invitations.id, invite.id));
      await expect(acceptInvitation(pendingUser, token)).rejects.toThrow(
        "expired",
      );
      const fresh = await inviteMember(owner, householdId, {
        email: pendingUser.email,
      });
      const pending = await getDb()
        .select()
        .from(schema.invitations)
        .where(
          and(
            eq(schema.invitations.householdId, householdId),
            eq(schema.invitations.email, pendingUser.email),
            sql`${schema.invitations.revokedAt} is null`,
          ),
        );
      await revokeInvitation(owner, householdId, pending[0].id);
      await expect(
        acceptInvitation(pendingUser, fresh.split("/").at(-1)!),
      ).rejects.toThrow();
    });
    it("supports multiple homes, scoped roles, repeat acceptance and tenant-safe lookups", async () => {
      for (const name of ["Pending user home", "Pending user second home"]) {
        additionalHomes.push(
          await createHousehold(pendingUser, { name, timeZone: "UTC" }),
        );
      }
      const url = await inviteMember(owner, householdId, {
        email: pendingUser.email,
      });
      const token = url.split("/").at(-1)!;
      expect((await invitationPreview(token))?.name).toBe(
        "Integration household",
      );
      expect(
        await Promise.all([
          acceptInvitation(pendingUser, token),
          acceptInvitation(pendingUser, token),
        ]),
      ).toEqual([householdId, householdId]);
      const homes = await householdsFor(pendingUser);
      expect(homes).toHaveLength(3);
      expect(homes.find((home) => home.id === householdId)?.role).toBe(
        "member",
      );
      expect(homes.find((home) => home.id === additionalHomes[0])?.role).toBe(
        "owner",
      );
      expect(await membershipFor(pendingUser, otherHousehold)).toBeUndefined();
      await expect(readHousehold(pendingUser, otherHousehold)).rejects.toThrow(
        "not available",
      );
      await expect(
        updateHousehold(pendingUser, householdId, {
          name: "Not allowed",
          timeZone: "UTC",
        }),
      ).rejects.toThrow("owner");
      await updateHousehold(pendingUser, additionalHomes[0], {
        name: "My renamed home",
        timeZone: "UTC",
      });
      const primary = await readHousehold(pendingUser, householdId);
      expect(primary.viewer.id).not.toBe(
        (await membershipFor(pendingUser, additionalHomes[0]))!.id,
      );
      expect(primary.bills.length).toBeGreaterThan(0);
      expect(
        (await readHousehold(pendingUser, additionalHomes[0])).bills,
      ).toHaveLength(0);
      await expect(
        getDb()
          .insert(schema.members)
          .values({ householdId, userId: pendingUser.id }),
      ).rejects.toThrow();
      expect(await invitationPreview("bad-link")).toBeNull();
    });
  },
);
