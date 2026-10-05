ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pos_tickets_store_request_key ON pos_tickets(store_id,request_key) WHERE request_key IS NOT NULL;
