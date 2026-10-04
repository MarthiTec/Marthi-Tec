-- Repair account owners whose credentials predate store membership creation.
INSERT INTO user_stores(id,user_id,store_id,role,is_default)
SELECT 'UST-OWNER-' || md5(u.id || ':' || s.id),u.id,s.id,'admin',
       NOT EXISTS(SELECT 1 FROM user_stores other WHERE other.user_id=u.id AND other.is_default)
FROM users u JOIN client_accounts c ON c.id=u.client_account_id AND lower(c.email)=lower(u.email)
JOIN LATERAL (SELECT id FROM stores WHERE client_account_id=c.id ORDER BY is_matrix DESC,created_at,id LIMIT 1) s ON true
WHERE u.global_role='admin'
ON CONFLICT(user_id,store_id) DO NOTHING;

-- The store team must include real login memberships, including the owner.
INSERT INTO employees(id,store_id,name,email,role,is_system_user,user_email,access_areas,permissions,active)
SELECT 'EMP-LOGIN-' || md5(u.id || ':' || us.store_id),us.store_id,u.name,u.email,us.role,true,u.email,
       CASE WHEN us.role='admin' THEN '["painel","pdv","erp","os","fiscal","totem","ecommerce"]'::jsonb ELSE '[]'::jsonb END,
       us.permissions,u.active
FROM users u JOIN user_stores us ON us.user_id=u.id JOIN stores s ON s.id=us.store_id AND s.client_account_id=u.client_account_id
WHERE NOT EXISTS(SELECT 1 FROM employees e WHERE e.store_id=us.store_id AND lower(COALESCE(NULLIF(e.user_email,''),e.email))=lower(u.email))
ON CONFLICT(id) DO NOTHING;
