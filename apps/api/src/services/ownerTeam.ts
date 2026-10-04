import type { PoolClient } from 'pg';
/** Makes the account owner's existing login visible in the store team. Never changes credentials. */
export async function ensureOwnerTeamMember(db: PoolClient, userId: string, storeId: string) {
  await db.query(`INSERT INTO employees(id,store_id,name,email,role,is_system_user,user_email,access_areas,permissions,active)
    SELECT 'EMP-LOGIN-' || md5(u.id || ':' || us.store_id),us.store_id,u.name,u.email,us.role,true,u.email,
      '["painel","pdv","erp","os","fiscal","totem","ecommerce"]'::jsonb,us.permissions,u.active
    FROM users u JOIN user_stores us ON us.user_id=u.id JOIN stores s ON s.id=us.store_id AND s.client_account_id=u.client_account_id
    WHERE u.id=$1 AND us.store_id=$2 AND us.role='admin'
    AND NOT EXISTS(SELECT 1 FROM employees e WHERE e.store_id=us.store_id AND lower(COALESCE(NULLIF(e.user_email,''),e.email))=lower(u.email))
    ON CONFLICT(id) DO NOTHING`, [userId,storeId]);
}
