import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireSession, requirePlatformAdmin } from '../middlewares/authMiddleware.js';

export const companyUsersRouter = Router();

companyUsersRouter.get('/api/v1/admin/company-users', requireSession, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const stores = await pool.query('SELECT id, trade_name FROM stores ORDER BY trade_name, id');
    const members = await pool.query(`
      SELECT DISTINCT u.id, u.name, u.email, u.active, us.store_id, us.role
      FROM users u
      JOIN user_stores us ON us.user_id = u.id
      ORDER BY u.name, u.email
    `);
    const employees = await pool.query(`
      SELECT id, store_id, name, user_email, email, role, active 
      FROM employees 
      WHERE is_system_user = true
    `);

    const data = stores.rows.map((store) => {
      const storeMembers = members.rows.filter((u) => u.store_id === store.id);
      const storeEmployees = employees.rows.filter((e) => e.store_id === store.id);

      const combinedMap = new Map<string, { id: string; name: string; email: string; active: boolean; role: string }>();

      for (const m of storeMembers) {
        if (!m.email) continue;
        combinedMap.set(m.email.toLowerCase(), {
          id: m.id,
          name: m.name || m.email,
          email: m.email,
          active: Boolean(m.active),
          role: m.role || 'admin',
        });
      }

      for (const e of storeEmployees) {
        const email = String(e.user_email || e.email || '').trim().toLowerCase();
        if (email && !combinedMap.has(email)) {
          combinedMap.set(email, {
            id: e.id,
            name: e.name || email,
            email,
            active: Boolean(e.active),
            role: e.role || 'employee',
          });
        }
      }

      const allUsers = Array.from(combinedMap.values());
      const activeUsers = allUsers.filter((u) => u.active).length;
      const inactiveUsers = allUsers.filter((u) => !u.active).length;

      return {
        storeId: store.id,
        tradeName: store.trade_name,
        users: allUsers,
        activeUsers,
        inactiveUsers,
        totalUsers: allUsers.length,
        missingEmail: storeEmployees.filter((e) => !String(e.user_email || e.email || '').trim()).length,
        duplicateLogins: 0,
        conflictingStatuses: 0,
        withoutAccount: 0,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
