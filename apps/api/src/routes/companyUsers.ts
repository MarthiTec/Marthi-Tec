import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireSession, requirePlatformAdmin } from '../middlewares/authMiddleware.js';
export const companyUsersRouter = Router();
companyUsersRouter.get('/api/v1/admin/company-users', requireSession, requirePlatformAdmin, async (_req,res,next) => {
  try {
    const stores = await pool.query('SELECT id,trade_name FROM stores ORDER BY trade_name,id');
    const members = await pool.query(`SELECT DISTINCT u.id,u.name,u.email,u.active,us.store_id,us.role
      FROM users u JOIN user_stores us ON us.user_id=u.id
      JOIN stores s ON s.id=us.store_id AND s.client_account_id=u.client_account_id ORDER BY u.name,u.email`);
    const employees = await pool.query('SELECT store_id,user_email,email,active FROM employees WHERE is_system_user=true');
    const data = stores.rows.map(store => {
      const users = members.rows.filter(u => u.store_id===store.id);
      const team = employees.rows.filter(e => e.store_id===store.id);
      const emails = team.map(e => String(e.user_email || e.email || '').trim().toLowerCase()).filter(Boolean);
      return {storeId:store.id,tradeName:store.trade_name,users,
        activeUsers:users.filter(u=>u.active).length,inactiveUsers:users.filter(u=>!u.active).length,totalUsers:users.length,
        missingEmail:team.filter(e=>!String(e.user_email || e.email || '').trim()).length,
        duplicateLogins:emails.length-new Set(emails).size,
        conflictingStatuses:new Set(emails.filter(email=>{const entries=team.filter(e=>String(e.user_email || e.email || '').trim().toLowerCase()===email);const user=users.find(u=>u.email.toLowerCase()===email);return entries.some(e=>user && Boolean(e.active)!==Boolean(user.active)) || new Set(entries.map(e=>Boolean(e.active))).size>1;})).size,
        withoutAccount:new Set(emails.filter(email=>!users.some(u=>u.email.toLowerCase()===email))).size};
    });
    res.json({success:true,data});
  } catch(error) { next(error); }
});
