-- Migration 0016: Self-Healing Core Schema, Partner Signups Persistence, and Multi-Tenant Isolation Tables
-- Garante que todas as tabelas essenciais para o funcionamento ponta a ponta existam,
-- persistindo contratações, tokens seguros, logs de e-mail, multi-loja, usuários, atributos e financeiro.

-- 1. Contratações de Parceiros (Ciclo Comercial, Planos e Ativação)
CREATE TABLE IF NOT EXISTS partner_signups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  document_type TEXT NOT NULL DEFAULT 'cnpj',
  document TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  complement TEXT DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  segment TEXT DEFAULT '',
  contact_name TEXT NOT NULL,
  contact_role TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'pix',
  transaction_ref TEXT,
  payment_confirmed_at TIMESTAMPTZ,
  activation_token_sent_at TIMESTAMPTZ,
  audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_signups_doc ON partner_signups(document);
CREATE INDEX IF NOT EXISTS idx_partner_signups_email ON partner_signups(email);
CREATE INDEX IF NOT EXISTS idx_partner_signups_status ON partner_signups(status);

-- 2. Contas de Clientes (Tenant Root)
CREATE TABLE IF NOT EXISTS client_accounts (
  id TEXT PRIMARY KEY,
  trade_name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'cnpj',
  document TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Lojas / Empresas Vinculadas (Multi-Loja)
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'cnpj',
  document TEXT NOT NULL,
  state_registration TEXT NOT NULL DEFAULT '',
  municipal_registration TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  zip_code TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  complement TEXT DEFAULT '',
  district TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state CHAR(2) NOT NULL DEFAULT '',
  tax_regime TEXT NOT NULL DEFAULT 'simples_nacional',
  is_matrix BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  totem_exit_password TEXT DEFAULT '1234',
  totem_settings JSONB DEFAULT '{}'::jsonb,
  communication_settings JSONB DEFAULT '{}'::jsonb,
  access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stores_account ON stores(client_account_id);
CREATE INDEX IF NOT EXISTS idx_stores_document ON stores(document);

-- 4. Licenciamento por Loja / Plano Contratado
CREATE TABLE IF NOT EXISTS store_licenses (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  client_account_id TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'golden',
  modules TEXT[] NOT NULL DEFAULT ARRAY['totem', 'presales', 'os', 'erp', 'fiscal']::TEXT[],
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_store ON store_licenses(store_id);
CREATE INDEX IF NOT EXISTS idx_licenses_account ON store_licenses(client_account_id);

-- 5. Usuários do Sistema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  client_account_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  picture TEXT,
  provider TEXT NOT NULL DEFAULT 'password',
  password_hash TEXT,
  global_role TEXT NOT NULL DEFAULT 'operator',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_account ON users(client_account_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 6. Associação Usuário-Loja (Permissões e Acesso)
CREATE TABLE IF NOT EXISTS user_stores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  is_default BOOLEAN NOT NULL DEFAULT false,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_store UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stores_user ON user_stores(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stores_store ON user_stores(store_id);

-- 7. Colaboradores e Funcionários da Loja
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'operator',
  is_system_user BOOLEAN NOT NULL DEFAULT false,
  user_email TEXT NOT NULL DEFAULT '',
  access_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  seller_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_email ON employees(user_email);

-- 8. Atributos de Produtos e Variações
CREATE TABLE IF NOT EXISTS product_attributes (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  use_on_totem BOOLEAN NOT NULL DEFAULT true,
  filter_on_totem BOOLEAN NOT NULL DEFAULT false,
  use_on_stock BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_attributes_store ON product_attributes(store_id);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_attr_values_attr ON product_attribute_values(attribute_id);

-- 9. Financeiro: Contas Bancárias, Contas a Pagar e Contas a Receber
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  bank TEXT DEFAULT '',
  agency TEXT DEFAULT '',
  number TEXT DEFAULT '',
  type TEXT DEFAULT 'checking',
  initial_balance NUMERIC(12,2) DEFAULT 0,
  current_balance NUMERIC(12,2) DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_store ON bank_accounts(store_id);

CREATE TABLE IF NOT EXISTS payables (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  description TEXT NOT NULL,
  supplier_id TEXT,
  supplier_name TEXT DEFAULT '',
  category TEXT DEFAULT 'Geral',
  amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  account_id TEXT,
  paid_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  document_number TEXT DEFAULT '',
  interest_amount NUMERIC(12,2) DEFAULT 0,
  fine_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  invoice_id TEXT,
  invoice_number TEXT DEFAULT '',
  invoice_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payables_store ON payables(store_id);
CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(store_id, status);

CREATE TABLE IF NOT EXISTS receivables (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  description TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT DEFAULT '',
  category TEXT DEFAULT 'Vendas',
  amount NUMERIC(12,2) NOT NULL,
  received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  account_id TEXT,
  received_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  document_number TEXT DEFAULT '',
  interest_amount NUMERIC(12,2) DEFAULT 0,
  fine_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  invoice_id TEXT,
  invoice_number TEXT DEFAULT '',
  invoice_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receivables_store ON receivables(store_id);
CREATE INDEX IF NOT EXISTS idx_receivables_status ON receivables(store_id, status);

CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  source TEXT DEFAULT 'manual',
  ref_id TEXT,
  account_id TEXT,
  category TEXT DEFAULT 'Operacional',
  operator_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_store ON finance_entries(store_id);

-- 10. Tokens de Segurança e Auditoria de E-mails
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  client_id TEXT,
  name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);

CREATE TABLE IF NOT EXISTS audit_email_logs (
  id TEXT PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON audit_email_logs(recipient);
