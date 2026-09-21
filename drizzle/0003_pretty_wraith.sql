ALTER TABLE "household_members" DROP CONSTRAINT "member_one_household";--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "member_household_user" UNIQUE("household_id","user_id");