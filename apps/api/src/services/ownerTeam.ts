import type { PoolClient } from 'pg';
/** Makes the account owner's existing login visible in the store team. Never changes credentials. */
export async function ensureOwnerTeamMember(db: PoolClient, userId: string, storeId: string) {
  await db.query('SAVEPOINT sp_owner_team');
  try {
    await db.query(
      `INSERT INTO employees(id,store_id,name,phone,email,document,role,is_system_user,user_email,access_areas,permissions,active,created_at)
       SELECT 'EMP-LOGIN-' || md5(u.id || ':' || us.store_id),us.store_id,u.name,'',u.email,'',us.role,true,u.email,
         (jsonb_populate_record(NULL::employees, jsonb_build_object('access_areas', '["painel","pdv","erp","os","fiscal","totem","ecommerce"]'::jsonb))).access_areas,
         COALESCE(us.permissions,'{}'::jsonb),u.active,now()
       FROM users u JOIN user_stores us ON us.user_id=u.id JOIN stores s ON s.id=us.store_id AND s.client_account_id=u.client_account_id
       WHERE u.id=$1 AND us.store_id=$2 AND us.role='admin'
       AND NOT EXISTS(SELECT 1 FROM employees e WHERE e.store_id=us.store_id AND lower(COALESCE(NULLIF(e.user_email,''),e.email))=lower(u.email))
       ON CONFLICT(id) DO NOTHING`,
      [userId, storeId],
    );
    await db.query('RELEASE SAVEPOINT sp_owner_team');
  } catch {
    await db.query('ROLLBACK TO SAVEPOINT sp_owner_team');
  }
}

