import type { PoolClient } from 'pg';

/** Full module set for store admins / account owners mirrored into employees. */
const ADMIN_ACCESS_AREAS_JSON = JSON.stringify([
  'painel',
  'pdv',
  'erp',
  'os',
  'fiscal',
  'totem',
  'ecommerce',
]);

async function runIsolated(db: PoolClient, savepoint: string, work: () => Promise<void>) {
  let sp = false;
  try {
    await db.query(`SAVEPOINT ${savepoint}`);
    sp = true;
  } catch {
    // Autocommit (e.g. GET /employees): no surrounding transaction — run bare.
  }
  try {
    await work();
    if (sp) await db.query(`RELEASE SAVEPOINT ${savepoint}`);
  } catch {
    if (sp) {
      try {
        await db.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Ensures every store login membership (user_stores) has a matching employees row
 * so Usuários & Permissões lists account owners and Google OAuth admins, not only
 * password operators created via the team form.
 *
 * Never changes credentials. Idempotent. Safe to call on every employees list.
 * Does not filter by provider (google vs password) or users.store_id (often null).
 */
export async function ensureStoreLoginTeamMembers(db: PoolClient, storeId: string) {
  await runIsolated(db, 'sp_login_team', async () => {
    await db.query(
      `INSERT INTO employees(
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
           THEN $2::jsonb
           ELSE '[]'::jsonb
         END,
         COALESCE(us.permissions, '{}'::jsonb),
         COALESCE(u.active, true),
         now()
       FROM users u
       JOIN user_stores us ON us.user_id = u.id
       JOIN stores s ON s.id = us.store_id AND s.client_account_id = u.client_account_id
       WHERE us.store_id = $1
         AND COALESCE(u.email, '') <> ''
         AND NOT EXISTS (
           SELECT 1 FROM employees e
           WHERE e.store_id = us.store_id
             AND lower(COALESCE(NULLIF(e.user_email, ''), e.email)) = lower(u.email)
         )
       ON CONFLICT (id) DO NOTHING`,
      [storeId, ADMIN_ACCESS_AREAS_JSON],
    );
  });
}

/**
 * Makes one account owner's existing login visible in the store team.
 * Prefer {@link ensureStoreLoginTeamMembers} for list hydration (covers all members).
 */
export async function ensureOwnerTeamMember(db: PoolClient, userId: string, storeId: string) {
  await runIsolated(db, 'sp_owner_team', async () => {
    await db.query(
      `INSERT INTO employees(
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
           ELSE COALESCE(NULLIF(us.role, ''), 'admin')
         END,
         true,
         u.email,
         $3::jsonb,
         COALESCE(us.permissions, '{}'::jsonb),
         COALESCE(u.active, true),
         now()
       FROM users u
       JOIN user_stores us ON us.user_id = u.id
       JOIN stores s ON s.id = us.store_id AND s.client_account_id = u.client_account_id
       WHERE u.id = $1
         AND us.store_id = $2
         AND COALESCE(u.email, '') <> ''
         AND NOT EXISTS (
           SELECT 1 FROM employees e
           WHERE e.store_id = us.store_id
             AND lower(COALESCE(NULLIF(e.user_email, ''), e.email)) = lower(u.email)
         )
       ON CONFLICT (id) DO NOTHING`,
      [userId, storeId, ADMIN_ACCESS_AREAS_JSON],
    );
  });
}
