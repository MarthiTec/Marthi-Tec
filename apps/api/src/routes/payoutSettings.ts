import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireSession, requirePlatformAdmin } from '../middlewares/authMiddleware.js';

export const payoutSettingsRouter = Router();
const bankSchema = z.object({
  bankCode: z.string().min(1), bankName: z.string().min(1), agency: z.string().min(1),
  accountNumber: z.string().min(1), accountType: z.enum(['corrente', 'poupanca']),
  holderName: z.string().min(1), holderDocument: z.string().min(1),
});
const pixSchema = z.object({
  keyType: z.enum(['email', 'cpf_cnpj', 'telefone', 'aleatoria']), keyValue: z.string().trim().min(1),
}).superRefine(({ keyType, keyValue }, ctx) => {
  const digits = keyValue.replace(/\D/g, '');
  const valid = keyType === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(keyValue)
    : keyType === 'cpf_cnpj' ? [11, 14].includes(digits.length)
    : keyType === 'telefone' ? /^\+?[\d ()-]+$/.test(keyValue) && digits.length >= 10 && digits.length <= 13
    : /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(keyValue);
  if (!valid) ctx.addIssue({ code: 'custom', message: 'Formato da chave Pix inválido.' });
});
const path = '/api/v1/admin/payout-settings';

payoutSettingsRouter.get('/api/v1/payout-settings/public', async (_req, res) => {
  try {
    const result = pool
      ? await pool.query("SELECT bank_account, pix FROM platform_payout_settings WHERE id = 'platform'")
      : { rows: [] };
    const bank = result.rows[0]?.bank_account ?? {};
    const pix = result.rows[0]?.pix ?? {};
    const keyValue = typeof pix.keyValue === 'string' && pix.keyValue.trim()
      ? pix.keyValue.trim()
      : 'marthi.tecnologia@gmail.com';
    const keyType = typeof pix.keyType === 'string' && pix.keyType.trim()
      ? pix.keyType
      : 'email';
    const receiverName =
      (typeof pix.receiverName === 'string' && pix.receiverName.trim()) ||
      (typeof bank.holderName === 'string' && bank.holderName.trim()) ||
      'Marthi Tecnologia';
    const bankName =
      (typeof bank.bankName === 'string' && bank.bankName.trim()) ||
      (typeof pix.receiverInstitution === 'string' && pix.receiverInstitution.trim()) ||
      '';
    res.json({
      success: true,
      data: {
        pix: { keyType, keyValue, receiverName },
        bankAccount: { holderName: receiverName, bankName },
      },
    });
  } catch {
    res.json({
      success: true,
      data: {
        pix: {
          keyType: 'email',
          keyValue: 'marthi.tecnologia@gmail.com',
          receiverName: 'Marthi Tecnologia',
        },
        bankAccount: { holderName: 'Marthi Tecnologia', bankName: '' },
      },
    });
  }
});

payoutSettingsRouter.get(path, requireSession, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT bank_account, pix FROM platform_payout_settings WHERE id = 'platform'");
    res.json({ success: true, data: { bankAccount: result.rows[0]?.bank_account ?? {}, pix: result.rows[0]?.pix ?? {} } });
  } catch (error) { next(error); }
});
for (const section of ['bank', 'pix'] as const) {
  payoutSettingsRouter.put(`${path}/${section}`, requireSession, requirePlatformAdmin, async (req, res, next) => {
    try {
      const input = section === 'bank' ? bankSchema.parse(req.body) : pixSchema.parse(req.body);
      const data = { ...input, updatedAt: new Date().toISOString(), updatedBy: req.user!.email,
        ...(section === 'bank' ? { validationStatus: 'pendente' } : { isValidated: false }) };
      const column = section === 'bank' ? 'bank_account' : 'pix';
      const result = await pool.query(
        `INSERT INTO platform_payout_settings (id, ${column}, updated_by) VALUES ('platform', $1::jsonb, $2)
         ON CONFLICT (id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING bank_account, pix`, [JSON.stringify(data), req.user!.id],
      );
      res.json({ success: true, data: { bankAccount: result.rows[0].bank_account, pix: result.rows[0].pix } });
    } catch (error) { next(error); }
  });
}
