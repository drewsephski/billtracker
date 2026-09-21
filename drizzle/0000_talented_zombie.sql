CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" date NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"template_id" uuid,
	"period" text,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_tenant_id" UNIQUE("household_id","id"),
	CONSTRAINT "bill_occurrence_unique" UNIQUE("template_id","period"),
	CONSTRAINT "bill_amount" CHECK ("bills"."amount_cents" > 0 and "bills"."amount_cents" <= 100000000),
	CONSTRAINT "bill_occurrence" CHECK (("bills"."template_id" is null and "bills"."period" is null) or ("bills"."template_id" is not null and "bills"."period" ~ '^d{4}-d{2}$'))
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_one_household" UNIQUE("user_id"),
	CONSTRAINT "member_tenant_id" UNIQUE("household_id","id"),
	CONSTRAINT "member_role" CHECK ("household_members"."role" in ('owner','member'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"split_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	CONSTRAINT "payment_amount" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payment_reversal" CHECK (("payments"."reversed_at" is null) = ("payments"."reversed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "split_tenant_id" UNIQUE("household_id","id"),
	CONSTRAINT "bill_member_unique" UNIQUE("bill_id","member_id"),
	CONSTRAINT "split_amount" CHECK ("bill_splits"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_template_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	CONSTRAINT "template_member_unique" UNIQUE("template_id","member_id"),
	CONSTRAINT "template_split_amount" CHECK ("recurring_template_splits"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recurring_bill_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"day_of_month" integer NOT NULL,
	"next_due_date" date NOT NULL,
	"split_mode" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_tenant_id" UNIQUE("household_id","id"),
	CONSTRAINT "template_amount" CHECK ("recurring_bill_templates"."amount_cents" > 0 and "recurring_bill_templates"."amount_cents" <= 100000000),
	CONSTRAINT "template_day" CHECK ("recurring_bill_templates"."day_of_month" between 1 and 31),
	CONSTRAINT "template_mode" CHECK ("recurring_bill_templates"."split_mode" in ('equal','custom'))
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_household_id_template_id_recurring_bill_templates_household_id_id_fk" FOREIGN KEY ("household_id","template_id") REFERENCES "public"."recurring_bill_templates"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_profiles_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_household_id_split_id_bill_splits_household_id_id_fk" FOREIGN KEY ("household_id","split_id") REFERENCES "public"."bill_splits"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_household_id_bill_id_bills_household_id_id_fk" FOREIGN KEY ("household_id","bill_id") REFERENCES "public"."bills"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_splits" ADD CONSTRAINT "bill_splits_household_id_member_id_household_members_household_id_id_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."household_members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_splits" ADD CONSTRAINT "recurring_template_splits_household_id_template_id_recurring_bill_templates_household_id_id_fk" FOREIGN KEY ("household_id","template_id") REFERENCES "public"."recurring_bill_templates"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_template_splits" ADD CONSTRAINT "recurring_template_splits_household_id_member_id_household_members_household_id_id_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."household_members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_templates" ADD CONSTRAINT "recurring_bill_templates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bill_templates" ADD CONSTRAINT "recurring_bill_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_household_due_idx" ON "bills" USING btree ("household_id","due_date");--> statement-breakpoint
CREATE INDEX "invitations_household_idx" ON "household_invitations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "members_household_idx" ON "household_members" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_payment_per_split" ON "payments" USING btree ("split_id") WHERE "payments"."reversed_at" is null;--> statement-breakpoint
CREATE INDEX "payments_household_date_idx" ON "payments" USING btree ("household_id","recorded_at");--> statement-breakpoint
CREATE INDEX "splits_member_idx" ON "bill_splits" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "template_generation_idx" ON "recurring_bill_templates" USING btree ("active","next_due_date");