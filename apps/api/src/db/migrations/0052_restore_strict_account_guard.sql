-- Restore the ownership guard even where a prior manual repair weakened it.
-- Does not move stores/users, alter passwords, activate licenses or invent inventory.
CREATE OR REPLACE FUNCTION marthi_guard_account_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.client_account_id IS NOT NULL AND NEW.client_account_id IS DISTINCT FROM OLD.client_account_id THEN
  RAISE EXCEPTION 'Account ownership cannot be reassigned' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
