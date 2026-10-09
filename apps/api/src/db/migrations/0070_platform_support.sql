-- Contatos de suporte da Marthi (aparecem na Central de ajuda de todas as lojas) e pedidos de ajuste
-- registrados pelas lojas. Os contatos ficam no banco e o superadmin pode alterar.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES (
  'support_contacts',
  jsonb_build_object(
    'email', 'marthi.tecnologia@gmail.com',
    'instagram', 'marthi.tecnologia',
    'whatsapp', '5524981244253',
    'address', 'Shopping Olga Sola · Centro · Três Rios — RJ'
  )
) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_store ON support_tickets(store_id, created_at DESC);
