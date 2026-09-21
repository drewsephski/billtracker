DROP INDEX "one_active_payment_per_split";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "source_command_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "source_created_bill" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_source_command_unique" ON "payments" USING btree ("source_command_id");--> statement-breakpoint
CREATE INDEX "payments_split_idx" ON "payments" USING btree ("household_id","split_id");--> statement-breakpoint
-- Preserve old full-share rows; replace only the old exact-share rule.
-- The parent UPDATE serializes even direct SQL writers and advances the proposal
-- version for every new contribution/reversal. Volatile trigger queries see the
-- committed predecessor after waiting for the lock at READ COMMITTED; stronger
-- isolation aborts a conflicting writer rather than accepting stale totals.
CREATE OR REPLACE FUNCTION check_payment_amount() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_bill uuid; share_total integer; active_total bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.household_id, NEW.split_id, NEW.amount_cents, NEW.recorded_by,
        NEW.recorded_at, NEW.source_command_id, NEW.source_created_bill)
       IS DISTINCT FROM
       (OLD.id, OLD.household_id, OLD.split_id, OLD.amount_cents, OLD.recorded_by,
        OLD.recorded_at, OLD.source_command_id, OLD.source_created_bill)
       OR (OLD.reversed_at IS NOT NULL AND
           (NEW.reversed_at, NEW.reversed_by) IS DISTINCT FROM (OLD.reversed_at, OLD.reversed_by)) THEN
      RAISE EXCEPTION 'Payment history is immutable; reverse the specific record' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT bill_id INTO target_bill FROM bill_splits
    WHERE id = NEW.split_id AND household_id = NEW.household_id;
  UPDATE bills SET version = version + 1 WHERE id = target_bill AND household_id = NEW.household_id;
  SELECT amount_cents INTO share_total FROM bill_splits
    WHERE id = NEW.split_id AND household_id = NEW.household_id;
  SELECT COALESCE(sum(amount_cents), 0) INTO active_total FROM payments
    WHERE split_id = NEW.split_id AND household_id = NEW.household_id
      AND reversed_at IS NULL AND id <> NEW.id;
  IF NEW.amount_cents <= 0 OR
     active_total + (CASE WHEN NEW.reversed_at IS NULL THEN NEW.amount_cents ELSE 0 END) > share_total THEN
    RAISE EXCEPTION 'Contributions cannot exceed the share amount' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- A direct split reduction must not invalidate the aggregate invariant either.
CREATE FUNCTION protect_settled_split() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM bills WHERE id = OLD.bill_id AND household_id = OLD.household_id FOR UPDATE;
  IF (NEW.household_id, NEW.bill_id, NEW.member_id, NEW.amount_cents)
      IS DISTINCT FROM (OLD.household_id, OLD.bill_id, OLD.member_id, OLD.amount_cents)
     AND EXISTS (SELECT 1 FROM payments WHERE split_id = OLD.id) THEN
    RAISE EXCEPTION 'Shares with payment history cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER settled_split_immutable BEFORE UPDATE ON bill_splits
  FOR EACH ROW EXECUTE FUNCTION protect_settled_split();
