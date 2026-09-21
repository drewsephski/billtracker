import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  sendChat,
  listChat,
  processChat,
  recoverChat,
} from "@/lib/server/chat";
import {
  confirmChatActivity,
  continueChatActivity,
} from "@/lib/server/chat-activity";
const chatAI = vi.hoisted(() => ({
  triage: vi.fn(),
  answer: vi.fn(),
  interpret: vi.fn(),
}));
vi.mock("@/lib/server/chat-ai", () => ({
  triageChat: chatAI.triage,
  answerChat: chatAI.answer,
}));
vi.mock("@/lib/server/activity-interpreter", () => ({
  interpretActivity: chatAI.interpret,
}));
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
import { prepareActivity, confirmActivity } from "@/lib/server/activity";
import { signActivity, verifyActivity } from "@/lib/server/activity-token";
import type { ActivityIntent } from "@/lib/domain/activity";
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
    it("persists shared messages, stable retries, sender names and cursor pagination with strict isolation", async () => {
      const key = randomUUID();
      const sent = await Promise.all([
        sendChat(owner, householdId, { text: "hello home", clientKey: key }),
        sendChat(owner, householdId, { text: "hello home", clientKey: key }),
      ]);
      expect(sent[0].id).toBe(sent[1].id);
      expect(
        (await listChat(roommate, householdId)).messages.some(
          (m) => m.id === sent[0].id,
        ),
      ).toBe(true);
      await expect(
        sendChat(roommate, householdId, { text: "hello home", clientKey: key }),
      ).rejects.toThrow("send key");
      await expect(listChat(outsider, householdId)).rejects.toThrow();
      await expect(
        sendChat(owner, otherHousehold, {
          text: "leak",
          clientKey: randomUUID(),
        }),
      ).rejects.toThrow();
      expect(
        (await listChat(outsider, otherHousehold, { watch: [sent[0].id] }))
          .updates,
      ).toEqual([]);
      await getDb()
        .insert(schema.chatMessages)
        .values(
          Array.from({ length: 45 }, (_, i) => ({
            householdId,
            senderId: roommateMember,
            senderName: "Historical Roommate",
            createdAt: new Date(Date.now() - 86400000),
            kind: "human" as const,
            text: `history ${i}`,
            clientKey: randomUUID(),
          })),
        );
      const latest = await listChat(owner, householdId);
      expect(latest.messages).toHaveLength(40);
      expect(latest.hasMore).toBe(true);
      const older = await listChat(owner, householdId, {
        before: latest.messages[0].cursor,
      });
      expect(older.messages).toHaveLength(6);
      expect(older.hasMore).toBe(false);
      const incremental = await listChat(owner, householdId, {
        after: older.messages.at(-1)!.cursor,
      });
      expect(incremental.messages.map((m) => m.id)).toEqual(
        latest.messages.map((m) => m.id),
      );
      expect(
        new Set([...older.messages, ...latest.messages].map((m) => m.id)).size,
      ).toBe(46);
      expect(latest.messages[0].senderName).toBe("Historical Roommate");
    });
    it("processes each source once, recovers leases, stays silent and keeps human sends during provider failures", async () => {
      chatAI.triage.mockResolvedValue("silent");
      const silent = await sendChat(owner, householdId, {
        text: "See you at dinner",
        clientKey: randomUUID(),
      });
      await Promise.all([
        processChat(owner, householdId, silent.id),
        processChat(owner, householdId, silent.id),
      ]);
      expect(
        (await listChat(owner, householdId)).messages.filter(
          (m) => m.sourceId === silent.id,
        ),
      ).toHaveLength(0);
      chatAI.triage.mockResolvedValue("answer");
      chatAI.answer.mockResolvedValue("Internet is settled.");
      const source = await sendChat(owner, householdId, {
        text: "@Homeshare is internet settled?",
        clientKey: randomUUID(),
      });
      await Promise.all([
        processChat(owner, householdId, source.id),
        processChat(owner, householdId, source.id),
        processChat(roommate, householdId, source.id),
      ]);
      await processChat(owner, householdId, source.id);
      expect(
        (await listChat(owner, householdId)).messages.filter(
          (m) => m.sourceId === source.id,
        ),
      ).toHaveLength(1);
      chatAI.triage.mockRejectedValue(new Error("provider unavailable"));
      const failed = await sendChat(roommate, householdId, {
        text: "@Homeshare help",
        clientKey: randomUUID(),
      });
      await getDb()
        .update(schema.chatJobs)
        .set({
          state: "processing",
          leaseUntil: new Date(0),
          leaseId: randomUUID(),
        })
        .where(eq(schema.chatJobs.sourceId, failed.id));
      await recoverChat(roommate, householdId);
      const visible = (await listChat(owner, householdId)).messages;
      expect(visible.some((m) => m.id === failed.id)).toBe(true);
      expect(visible.filter((m) => m.sourceId === failed.id)).toHaveLength(1);
    });
    it("reuses activity proposals privately, restricts confirmation to source author and atomically publishes one result", async () => {
      const billId = await saveBill(
        owner,
        householdId,
        input({ name: "Chat Electricity" }),
      );
      chatAI.triage.mockResolvedValue("activity");
      chatAI.interpret.mockResolvedValue({
        intent: "contribution",
        payer: "I",
        amount: "10",
        bill: "Chat Electricity",
        category: "Electricity",
        total: null,
        dueDate: null,
        period: null,
        household: null,
        incomplete: false,
      });
      const source = await sendChat(roommate, householdId, {
        text: "I paid $10 toward Chat Electricity",
        clientKey: randomUUID(),
      });
      await processChat(roommate, householdId, source.id);
      expect(chatAI.interpret.mock.calls.at(-1)![0].history).toEqual([]);
      const proposal = (await listChat(owner, householdId)).messages.find(
        (m) => m.sourceId === source.id,
      )!;
      expect(proposal.reply?.proposal?.payerName).toBe(roommate.name);
      expect(proposal.reply).not.toHaveProperty("token");
      expect(proposal.actionable).toBe(true);
      await expect(
        confirmChatActivity(owner, householdId, proposal.id),
      ).rejects.toThrow("Only the roommate");
      await expect(
        confirmChatActivity(outsider, otherHousehold, proposal.id),
      ).rejects.toThrow();
      await expect(
        continueChatActivity(owner, householdId, proposal.id, { cancel: true }),
      ).rejects.toThrow("Only the roommate");
      const first = await confirmChatActivity(
        roommate,
        householdId,
        proposal.id,
      );
      const retry = await confirmChatActivity(
        roommate,
        householdId,
        proposal.id,
      );
      expect(first.kind).toBe("success");
      expect(retry).toEqual(first);
      expect(first.billUrl).toBe(`/bills/${billId}`);
      const page = await listChat(owner, householdId, { watch: [proposal.id] });
      expect(page.updates[0].actionable).toBe(false);
      expect(
        page.messages.filter(
          (m) => m.sourceId === source.id && m.kind === "system",
        ),
      ).toHaveLength(1);
      const data = await readHousehold(roommate, householdId);
      expect(data.bills.find((b) => b.id === billId)!.paidCents).toBe(1000);
    });
    afterAll(async () => {
      const ids = [householdId, otherHousehold, ...additionalHomes].filter(
        Boolean,
      );
      if (ids.length)
        await getDb().transaction(async (tx) => {
          await tx
            .delete(schema.chatJobs)
            .where(inArray(schema.chatJobs.householdId, ids));
          await tx
            .delete(schema.chatMessages)
            .where(inArray(schema.chatMessages.householdId, ids));
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

    const activityIntent = (
      overrides: Partial<ActivityIntent> = {},
    ): ActivityIntent => ({
      intent: "contribution",
      payer: "I",
      amount: "10",
      bill: "Activity internet",
      category: "Internet",
      total: null,
      dueDate: null,
      period: null,
      household: null,
      incomplete: false,
      ...overrides,
    });
    const freshBill = async () => {
      const name = `Activity ${randomUUID()}`;
      const id = await saveBill(
        owner,
        householdId,
        input({ name, amount: "100.00", category: "Internet" }),
      );
      const bill = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.id === id,
      )!;
      return {
        bill,
        own: bill.splits.find((s) => s.memberId === ownerMember)!,
        other: bill.splits.find((s) => s.memberId === roommateMember)!,
      };
    };
    it("supports partial + partial + manual remaining, individual reversal and replacement", async () => {
      const { bill, own, other } = await freshBill();
      await recordPayment(owner, householdId, bill.id, own.id, undefined, 1000);
      await recordPayment(owner, householdId, bill.id, own.id, undefined, 1500);
      let data = await readHousehold(owner, householdId);
      let share = data.bills
        .find((b) => b.id === bill.id)!
        .splits.find((s) => s.id === own.id)!;
      expect(share.paidCents).toBe(2500);
      expect(share.activePaymentCount).toBe(2);
      const firstPayment = data.payments.find(
        (p) => p.billId === bill.id && p.amountCents === 1000,
      )!;
      await recordPayment(owner, householdId, bill.id, own.id, firstPayment.id);
      data = await readHousehold(owner, householdId);
      expect(data.bills.find((b) => b.id === bill.id)!.paidCents).toBe(1500);
      await recordPayment(owner, householdId, bill.id, own.id, undefined, 500);
      await recordPayment(owner, householdId, bill.id, own.id);
      data = await readHousehold(owner, householdId);
      share = data.bills
        .find((b) => b.id === bill.id)!
        .splits.find((s) => s.id === own.id)!;
      expect(share.paidCents).toBe(5000);
      expect(share.activePaymentCount).toBe(3);
      expect(
        data.payments.filter((p) => p.billId === bill.id && p.reversedAt),
      ).toHaveLength(1);
      await recordPayment(
        roommate,
        householdId,
        bill.id,
        other.id,
        undefined,
        2000,
      );
      await recordPayment(
        roommate,
        householdId,
        bill.id,
        other.id,
        undefined,
        3000,
      );
      expect(
        (await readHousehold(owner, householdId)).bills.find(
          (b) => b.id === bill.id,
        )!.status,
      ).toBe("paid");
      await expect(
        recordPayment(owner, householdId, bill.id, own.id, undefined, 1),
      ).rejects.toThrow("remaining");
      await expect(
        saveBill(owner, householdId, input(), { id: bill.id, version: 1 }),
      ).rejects.toThrow("history");
    });
    it("rejects nonpositive/fractional and excess contributions, permits owners and enforces own-share permissions", async () => {
      const { bill, own, other } = await freshBill();
      for (const amount of [0, -1, 1.5, 5001])
        await expect(
          recordPayment(owner, householdId, bill.id, own.id, undefined, amount),
        ).rejects.toThrow();
      await expect(
        recordPayment(roommate, householdId, bill.id, own.id, undefined, 100),
      ).rejects.toThrow("own share");
      await recordPayment(
        owner,
        householdId,
        bill.id,
        other.id,
        undefined,
        100,
      );
      await expect(
        recordPayment(
          outsider,
          otherHousehold,
          bill.id,
          own.id,
          undefined,
          100,
        ),
      ).rejects.toThrow("Bill not found");
      expect(
        (await readHousehold(owner, householdId)).bills.find(
          (b) => b.id === bill.id,
        )!.paidCents,
      ).toBe(100);
    });
    it("serializes concurrent +30/+30 with only $50 remaining", async () => {
      const { bill, own } = await freshBill();
      const results = await Promise.allSettled([
        recordPayment(owner, householdId, bill.id, own.id, undefined, 3000),
        recordPayment(owner, householdId, bill.id, own.id, undefined, 3000),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const data = await readHousehold(owner, householdId);
      expect(data.bills.find((b) => b.id === bill.id)!.paidCents).toBe(3000);
      expect(data.payments.filter((p) => p.billId === bill.id)).toHaveLength(1);
    });
    it("DB trigger rejects concurrent raw overpayments and immutable-history updates", async () => {
      const { bill, own } = await freshBill();
      const insert = () =>
        getDb().transaction(async (tx) => {
          await tx.insert(schema.payments).values({
            householdId,
            splitId: own.id,
            recordedBy: owner.id,
            amountCents: 3000,
          });
          await tx.execute(sql`select pg_sleep(0.15)`);
        });
      const results = await Promise.allSettled([insert(), insert()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const data = await readHousehold(owner, householdId);
      const payment = data.payments.find((p) => p.billId === bill.id)!;
      expect(data.bills.find((b) => b.id === bill.id)!.paidCents).toBe(3000);
      await expect(
        getDb()
          .update(schema.payments)
          .set({ amountCents: 1 })
          .where(eq(schema.payments.id, payment.id)),
      ).rejects.toThrow();
      await expect(
        getDb()
          .update(schema.splits)
          .set({ amountCents: 2000 })
          .where(eq(schema.splits.id, own.id)),
      ).rejects.toThrow();
    });
    it("confirms an existing bill exactly once, including concurrent retries and replay after reversal", async () => {
      const { bill, own } = await freshBill();
      const reply = prepareActivity(
        owner,
        await readHousehold(owner, householdId),
        activityIntent({ bill: bill.name }),
        [],
      );
      expect(reply.kind).toBe("proposal");
      const results = await Promise.all([
        confirmActivity(owner, householdId, reply.token!),
        confirmActivity(owner, householdId, reply.token!),
      ]);
      expect(results.every((r) => r.kind === "success")).toBe(true);
      expect(
        results.filter((r) => r.message.includes("already recorded")),
      ).toHaveLength(1);
      let data = await readHousehold(owner, householdId);
      const expired = signActivity({
        ...verifyActivity(reply.token!, owner.id, householdId),
        expires: 0,
      });
      expect(
        (await confirmActivity(owner, householdId, expired)).message,
      ).toContain("already recorded");
      expect(data.payments.filter((p) => p.billId === bill.id)).toHaveLength(1);
      const payment = data.payments.find((p) => p.billId === bill.id)!;
      await recordPayment(owner, householdId, bill.id, own.id, payment.id);
      expect(
        (await confirmActivity(owner, householdId, reply.token!)).message,
      ).toContain("reversed");
      data = await readHousehold(owner, householdId);
      expect(data.bills.find((b) => b.id === bill.id)!.paidCents).toBe(0);
    });
    it("requires confirmation again after any bill state changes", async () => {
      const { bill, own } = await freshBill();
      const reply = prepareActivity(
        owner,
        await readHousehold(owner, householdId),
        activityIntent({ bill: bill.name }),
        [],
      );
      await recordPayment(owner, householdId, bill.id, own.id, undefined, 500);
      const refreshed = await confirmActivity(owner, householdId, reply.token!);
      expect(refreshed.kind).toBe("proposal");
      expect(refreshed.message).toContain("changed");
      expect(refreshed.proposal?.remainingCents).toBe(3500);
      expect(
        (await readHousehold(owner, householdId)).bills.find(
          (b) => b.id === bill.id,
        )!.paidCents,
      ).toBe(500);
      expect(
        (await confirmActivity(owner, householdId, refreshed.token!)).kind,
      ).toBe("success");
      const editBill = await freshBill();
      const editProposal = prepareActivity(
        owner,
        await readHousehold(owner, householdId),
        activityIntent({ bill: editBill.bill.name }),
        [],
      );
      await saveBill(
        owner,
        householdId,
        input({
          name: editBill.bill.name,
          amount: "120",
          category: "Internet",
        }),
        { id: editBill.bill.id, version: 1 },
      );
      expect(
        (await confirmActivity(owner, householdId, editProposal.token!)).kind,
      ).toBe("proposal");
    });
    it("creates an equal-split one-time bill and contribution atomically, once under concurrent replay", async () => {
      const name = `Brand new ${randomUUID()}`;
      const data = await readHousehold(owner, householdId);
      const reply = prepareActivity(
        owner,
        data,
        activityIntent({
          bill: name,
          category: "Other",
          total: "100.01",
          dueDate: "2028-02-28",
        }),
        [],
      );
      const before = data.bills.length;
      const results = await Promise.all([
        confirmActivity(owner, householdId, reply.token!),
        confirmActivity(owner, householdId, reply.token!),
      ]);
      expect(results.some((r) => r.message.startsWith("Created"))).toBe(true);
      const after = await readHousehold(owner, householdId);
      expect(after.bills).toHaveLength(before + 1);
      const bill = after.bills.find((b) => b.name === name)!;
      expect(bill.templateId).toBeNull();
      expect(bill.paidCents).toBe(1000);
      expect(bill.splits.map((s) => s.amountCents).sort()).toEqual([
        5000, 5001,
      ]);
      expect(after.payments.filter((p) => p.billId === bill.id)).toHaveLength(
        1,
      );
    });
    it("rolls back the newly created bill when contribution insertion fails", async () => {
      const name = `Rollback ${randomUUID()}`;
      const reply = prepareActivity(
        owner,
        await readHousehold(owner, householdId),
        activityIntent({
          bill: name,
          category: "Other",
          total: "100.00",
          dueDate: "2028-02-28",
        }),
        [],
      );
      const context = verifyActivity(reply.token!, owner.id, householdId);
      // Force the unique-index backstop to fail after bill+splits creation. A
      // different tenant's command must neither replay nor expose that bill.
      const otherId = await saveBill(
        outsider,
        otherHousehold,
        input({ memberIds: [outsiderMember] }),
      );
      const other = (await readHousehold(outsider, otherHousehold)).bills.find(
        (b) => b.id === otherId,
      )!;
      await getDb().insert(schema.payments).values({
        householdId: otherHousehold,
        splitId: other.splits[0].id,
        amountCents: 1,
        recordedBy: outsider.id,
        sourceCommandId: context.commandId,
      });
      await expect(
        confirmActivity(owner, householdId, reply.token!),
      ).rejects.toThrow();
      expect(
        (await readHousehold(owner, householdId)).bills.some(
          (b) => b.name === name,
        ),
      ).toBe(false);
      await expect(
        confirmActivity(owner, otherHousehold, reply.token!),
      ).rejects.toThrow("household changed");
      await expect(
        confirmActivity(roommate, householdId, reply.token!),
      ).rejects.toThrow("household changed");
    });
    it("refuses historical shares and refreshes a new bill after membership changes", async () => {
      const { bill } = await freshBill();
      const name = `Membership ${randomUUID()}`;
      const reply = prepareActivity(
        owner,
        await readHousehold(owner, householdId),
        activityIntent({
          bill: name,
          category: "Other",
          total: "120",
          dueDate: "2028-02-28",
        }),
        [],
      );
      // pendingUser is already a reserved test fixture and cleaned up below.
      const url = await inviteMember(owner, householdId, {
        email: pendingUser.email,
      });
      await acceptInvitation(pendingUser, url.split("/").at(-1)!);
      const refreshed = await confirmActivity(owner, householdId, reply.token!);
      expect(refreshed.kind).toBe("proposal");
      expect(refreshed.proposal?.allocations).toHaveLength(3);
      expect(
        (await readHousehold(owner, householdId)).bills.some(
          (b) => b.name === name,
        ),
      ).toBe(false);
      const historical = prepareActivity(
        owner,
        await readHousehold(owner, householdId),
        activityIntent({ bill: bill.name, payer: pendingUser.name }),
        [],
      );
      expect(historical.kind).toBe("clarification");
      expect(historical.message).toContain("does not have a share");
      expect(
        (await confirmActivity(owner, householdId, refreshed.token!)).message,
      ).toContain("Created");
      // Restore membership so the existing multi-home invitation test retains
      // its original preconditions. This member has shares in the new bill,
      // so remove only that test bill's records first within one transaction.
      const created = (await readHousehold(owner, householdId)).bills.find(
        (b) => b.name === name,
      )!;
      await getDb().transaction(async (tx) => {
        await tx.delete(schema.payments).where(
          inArray(
            schema.payments.splitId,
            created.splits.map((s) => s.id),
          ),
        );
        await tx
          .delete(schema.splits)
          .where(eq(schema.splits.billId, created.id));
        await tx.delete(schema.bills).where(eq(schema.bills.id, created.id));
        await tx
          .delete(schema.members)
          .where(
            and(
              eq(schema.members.householdId, householdId),
              eq(schema.members.userId, pendingUser.id),
            ),
          );
      });
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
