-- Fields used by the cash API, preserving canonical session/event fields.
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS terminal_id TEXT REFERENCES pos_terminals(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS operator_id TEXT REFERENCES users(id);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closed_amount NUMERIC(12,2);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS opening_float NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS difference NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS closing_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id);
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS beneficiary_type TEXT;
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS beneficiary_name TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS operator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE cash_session_events ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES sales_orders(id);
UPDATE cash_session_events e SET store_id = s.store_id FROM cash_sessions s WHERE e.session_id = s.id AND e.store_id IS NULL;
CREATE OR REPLACE FUNCTION marthi_sync_cash_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_store TEXT;
BEGIN
 SELECT store_id INTO session_store FROM cash_sessions WHERE id = NEW.session_id;
 NEW.store_id := COALESCE(NEW.store_id, session_store);
 IF NEW.store_id IS DISTINCT FROM session_store THEN RAISE EXCEPTION 'Cash session belongs to another store' USING ERRCODE='23514'; END IF;
 NEW.event_type := COALESCE(NEW.type,NEW.event_type);
 NEW.type := COALESCE(NEW.type,NEW.event_type);
 IF NEW.type IS DISTINCT FROM NEW.event_type THEN RAISE EXCEPTION 'Inconsistent cash event type' USING ERRCODE='23514'; END IF;
 NEW.notes := COALESCE(NULLIF(NEW.note,''),NEW.notes);
 RETURN NEW;
END $$;
CREATE TRIGGER marthi_sync_cash_event BEFORE INSERT OR UPDATE ON cash_session_events FOR EACH ROW EXECUTE FUNCTION marthi_sync_cash_event();
CREATE TRIGGER marthi_guard_cash_event BEFORE INSERT OR UPDATE ON cash_session_events FOR EACH ROW EXECUTE FUNCTION marthi_guard_store_references('session_id','cash_sessions','order_id','sales_orders');
CREATE OR REPLACE FUNCTION marthi_sync_cash_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.initial_amount := NEW.opening_float;
 NEW.closed_amount := NEW.counted_cash;
 RETURN NEW;
END $$;
CREATE TRIGGER marthi_sync_cash_session BEFORE INSERT OR UPDATE ON cash_sessions FOR EACH ROW EXECUTE FUNCTION marthi_sync_cash_session();
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS code INT;
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'totem';
ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
