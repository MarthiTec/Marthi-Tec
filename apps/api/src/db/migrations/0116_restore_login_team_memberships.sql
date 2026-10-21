-- Re-mirror user_stores logins into employees (owners / Google OAuth / null users.store_id).
-- Same intent as 0032; safe to re-run. Does not change credentials.
INSERT INTO employees(
  id, store_id, name, phone, email, document, role, is_system_user, user_email,
  access_areas, permissions, active, created_at
)
SELECT
  'EMP-LOGIN-' || md5(u.id || ':' || us.store_id),
  us.store_id,
  COALESCE(NULLIF(u.name, ''), u.email),
  '',
  u.email,
  '',
  CASE
    WHEN lower(COALESCE(u.global_role, '')) IN ('admin', 'superadmin', 'owner') THEN 'admin'
    WHEN lower(COALESCE(us.role, '')) IN ('admin', 'owner', 'administrador') THEN 'admin'
    WHEN lower(COALESCE(us.role, '')) IN ('manager', 'gerente') THEN 'manager'
    ELSE COALESCE(NULLIF(us.role, ''), 'operator')
  END,
  true,
  u.email,
  CASE
    WHEN lower(COALESCE(u.global_role, '')) IN ('admin', 'superadmin', 'owner')
      OR lower(COALESCE(us.role, '')) IN ('admin', 'owner', 'manager', 'administrador', 'gerente')
    THEN '["painel","pdv","erp","os","fiscal","totem","ecommerce"]'::jsonb
    ELSE '[]'::jsonb
  END,
  COALESCE(us.permissions, '{}'::jsonb),
  COALESCE(u.active, true),
  now()
FROM users u
JOIN user_stores us ON us.user_id = u.id
JOIN stores s ON s.id = us.store_id AND s.client_account_id = u.client_account_id
WHERE COALESCE(u.email, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.store_id = us.store_id
      AND lower(COALESCE(NULLIF(e.user_email, ''), e.email)) = lower(u.email)
  )
ON CONFLICT (id) DO NOTHING;
