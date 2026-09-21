import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  unique,
  index,
  check,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  ...timestamps,
});
export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull(),
  ...timestamps,
});
export const members = pgTable(
  "household_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    ...timestamps,
  },
  (t) => [
    unique("member_household_user").on(t.householdId, t.userId),
    index("members_user_idx").on(t.userId),
    unique("member_tenant_id").on(t.householdId, t.id),
    index("members_household_idx").on(t.householdId),
    check("member_role", sql`${t.role} in ('owner','member')`),
  ],
);
export const invitations = pgTable(
  "household_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => profiles.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("invitations_household_idx").on(t.householdId)],
);
export const templates = pgTable(
  "recurring_bill_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dayOfMonth: integer("day_of_month").notNull(),
    nextDueDate: date("next_due_date").notNull(),
    splitMode: text("split_mode", { enum: ["equal", "custom"] }).notNull(),
    active: boolean("active").default(true).notNull(),
    version: integer("version").default(1).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.id),
    ...timestamps,
  },
  (t) => [
    unique("template_tenant_id").on(t.householdId, t.id),
    index("template_generation_idx").on(t.active, t.nextDueDate),
    check(
      "template_amount",
      sql`${t.amountCents} > 0 and ${t.amountCents} <= 100000000`,
    ),
    check("template_day", sql`${t.dayOfMonth} between 1 and 31`),
    check("template_mode", sql`${t.splitMode} in ('equal','custom')`),
  ],
);
export const templateSplits = pgTable(
  "recurring_template_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    templateId: uuid("template_id").notNull(),
    memberId: uuid("member_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    unique("template_member_unique").on(t.templateId, t.memberId),
    foreignKey({
      columns: [t.householdId, t.templateId],
      foreignColumns: [templates.householdId, templates.id],
    }),
    foreignKey({
      columns: [t.householdId, t.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    check("template_split_amount", sql`${t.amountCents} >= 0`),
  ],
);
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueDate: date("due_date").notNull(),
    notes: text("notes").notNull().default(""),
    templateId: uuid("template_id"),
    period: text("period"),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.id),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    unique("bill_tenant_id").on(t.householdId, t.id),
    unique("bill_occurrence_unique").on(t.templateId, t.period),
    index("bill_household_due_idx").on(t.householdId, t.dueDate),
    foreignKey({
      columns: [t.householdId, t.templateId],
      foreignColumns: [templates.householdId, templates.id],
    }),
    check(
      "bill_amount",
      sql`${t.amountCents} > 0 and ${t.amountCents} <= 100000000`,
    ),
    check(
      "bill_occurrence",
      sql`(${t.templateId} is null and ${t.period} is null) or (${t.templateId} is not null and ${t.period} ~ '^[0-9]{4}-[0-9]{2}$')`,
    ),
  ],
);
export const splits = pgTable(
  "bill_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    billId: uuid("bill_id").notNull(),
    memberId: uuid("member_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [
    unique("split_tenant_id").on(t.householdId, t.id),
    unique("bill_member_unique").on(t.billId, t.memberId),
    foreignKey({
      columns: [t.householdId, t.billId],
      foreignColumns: [bills.householdId, bills.id],
    }),
    foreignKey({
      columns: [t.householdId, t.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    check("split_amount", sql`${t.amountCents} >= 0`),
    index("splits_member_idx").on(t.householdId, t.memberId),
  ],
);
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    splitId: uuid("split_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => profiles.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: text("reversed_by").references(() => profiles.id),
    sourceCommandId: uuid("source_command_id"),
    sourceCreatedBill: boolean("source_created_bill").notNull().default(false),
  },
  (t) => [
    foreignKey({
      columns: [t.householdId, t.splitId],
      foreignColumns: [splits.householdId, splits.id],
    }),
    uniqueIndex("payment_source_command_unique").on(t.sourceCommandId),
    index("payments_split_idx").on(t.householdId, t.splitId),
    index("payments_household_date_idx").on(t.householdId, t.recordedAt),
    check("payment_amount", sql`${t.amountCents} > 0`),
    check(
      "payment_reversal",
      sql`(${t.reversedAt} is null) = (${t.reversedBy} is null)`,
    ),
  ],
);
