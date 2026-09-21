CREATE UNIQUE INDEX "chat_active_message_unique" ON "chat_jobs" USING btree ("household_id","active_message_id");--> statement-breakpoint
CREATE INDEX "chat_source_idx" ON "chat_messages" USING btree ("household_id","source_id");--> statement-breakpoint
CREATE INDEX "chat_sender_rate_idx" ON "chat_messages" USING btree ("household_id","sender_id","created_at");