-- Lembrete de chegada da encomenda: no dia previsto (venda com retirada "encomenda" ou encomenda da
-- tela Encomendas & Ofertas), a partir da hora configurada (padrão 10h), o sistema manda WhatsApp para
-- o cliente avisando que o produto está a caminho e um lembrete para o número da loja.
-- Cada lembrete fica registrado (uma vez por encomenda e data), com o resultado do envio.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS order_reminder_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS order_reminders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- pickup = venda com retirada por encomenda; commercial = Encomendas & Ofertas
  source TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  reminder_date DATE NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  customer_message TEXT NOT NULL DEFAULT '',
  store_message TEXT NOT NULL DEFAULT '',
  customer_status TEXT NOT NULL DEFAULT 'pending',
  store_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, source, ref_id, reminder_date)
);
CREATE INDEX IF NOT EXISTS idx_order_reminders_store ON order_reminders(store_id, reminder_date DESC);
