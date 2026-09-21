-- Reviewed: additive chat tables only. Existing financial invariants are unchanged.
-- Names are snapshots; signed tokens live only in private job state.
CREATE TABLE "chat_jobs" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"active_message_id" uuid,
	"token" text,
	CONSTRAINT "chat_job_state" CHECK ("chat_jobs"."state" in ('queued','processing','done'))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigserial NOT NULL,
	"household_id" uuid NOT NULL,
	"sender_id" uuid,
	"sender_name" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"client_key" uuid NOT NULL,
	"source_id" uuid,
	"reply" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_tenant_id" UNIQUE("household_id","id"),
	CONSTRAINT "chat_send_unique" UNIQUE("household_id","kind","client_key"),
	CONSTRAINT "chat_kind" CHECK ("chat_messages"."kind" in ('human','assistant','system')),
	CONSTRAINT "chat_sender" CHECK (("chat_messages"."kind" = 'human') = ("chat_messages"."sender_id" is not null)),
	CONSTRAINT "chat_text_length" CHECK (length("chat_messages"."text") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "chat_jobs" ADD CONSTRAINT "chat_jobs_household_id_source_id_chat_messages_household_id_id_fk" FOREIGN KEY ("household_id","source_id") REFERENCES "public"."chat_messages"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_jobs" ADD CONSTRAINT "chat_jobs_household_id_active_message_id_chat_messages_household_id_id_fk" FOREIGN KEY ("household_id","active_message_id") REFERENCES "public"."chat_messages"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_household_id_sender_id_household_members_household_id_id_fk" FOREIGN KEY ("household_id","sender_id") REFERENCES "public"."household_members"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_household_id_source_id_chat_messages_household_id_id_fk" FOREIGN KEY ("household_id","source_id") REFERENCES "public"."chat_messages"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_jobs_recovery_idx" ON "chat_jobs" USING btree ("household_id","state","lease_until");--> statement-breakpoint
CREATE INDEX "chat_cursor_idx" ON "chat_messages" USING btree ("household_id","sequence");