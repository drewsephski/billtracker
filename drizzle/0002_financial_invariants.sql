-- Deferred checks allow a bill and all its splits to be written atomically.
CREATE FUNCTION check_bill_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; total integer; allocated bigint;
BEGIN
  IF TG_TABLE_NAME = 'bills' THEN target_id := COALESCE(NEW.id, OLD.id);
  ELSE target_id := COALESCE(NEW.bill_id, OLD.bill_id); END IF;
  SELECT amount_cents INTO total FROM bills WHERE id = target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount_cents), 0) INTO allocated FROM bill_splits WHERE bill_id = target_id;
  IF allocated <> total THEN RAISE EXCEPTION 'Bill splits must equal total' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER bill_balance AFTER INSERT OR UPDATE ON bills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_bill_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER split_balance AFTER INSERT OR UPDATE OR DELETE ON bill_splits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_bill_balance();
--> statement-breakpoint
CREATE FUNCTION check_template_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; total integer; allocated bigint;
BEGIN
  IF TG_TABLE_NAME = 'recurring_bill_templates' THEN target_id := COALESCE(NEW.id, OLD.id);
  ELSE target_id := COALESCE(NEW.template_id, OLD.template_id); END IF;
  SELECT amount_cents INTO total FROM recurring_bill_templates WHERE id = target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount_cents), 0) INTO allocated FROM recurring_template_splits WHERE template_id = target_id;
  IF allocated <> total THEN RAISE EXCEPTION 'Template splits must equal total' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER template_balance AFTER INSERT OR UPDATE ON recurring_bill_templates DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_template_balance();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER template_split_balance AFTER INSERT OR UPDATE OR DELETE ON recurring_template_splits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_template_balance();
--> statement-breakpoint
CREATE FUNCTION check_payment_amount() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_cents <> (SELECT amount_cents FROM bill_splits WHERE id = NEW.split_id AND household_id = NEW.household_id) THEN
    RAISE EXCEPTION 'Payment must settle exactly one share' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payment_amount_check BEFORE INSERT OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION check_payment_amount();
