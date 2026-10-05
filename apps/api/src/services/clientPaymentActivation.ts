import { ensureOwnerTeamMember } from './ownerTeam.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

/** Confirms an existing customer's payment without recreating stores or changing their plan. */
export async function confirmExistingClientPayment(input: {
  protocol: string; paymentMethod: string; transactionRef?: string; notes?: string; actorId: string;
}) {
  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const actor = await db.query("SELECT id FROM users WHERE id=$1 AND active=true AND global_role='superadmin'", [input.actorId]);
    if (!actor.rows[0]) throw Object.assign(new Error('Acesso administrativo restrito.'), { status: 403 });
    const found = await db.query('SELECT * FROM client_accounts WHERE id=$1 FOR UPDATE', [input.protocol]);
    const account = found.rows[0];
    if (!account) { await db.query('ROLLBACK'); return null; }
    const previous = await db.query('SELECT * FROM client_payment_confirmations WHERE client_account_id=$1', [account.id]);
    if (previous.rows[0]) {
      await db.query('COMMIT');
      return { account, alreadyProcessed: true, status: previous.rows[0].contracting_status, rawToken: null, monthlyAmount: 0, planId: '' };
    }
    const stores = await db.query('SELECT * FROM stores WHERE client_account_id=$1 ORDER BY is_matrix DESC,created_at,id LIMIT 1 FOR UPDATE', [account.id]);
    const store = stores.rows[0];
    if (!store) throw Object.assign(new Error('Cliente sem loja cadastrada. Complete o cadastro antes de liberar o acesso.'), { status: 409 });
    const licenses = await db.query('SELECT * FROM store_licenses WHERE store_id=$1 AND client_account_id=$2 FOR UPDATE', [store.id, account.id]);
    const license = licenses.rows[0];
    if (!license) throw Object.assign(new Error('Loja sem licença cadastrada. Ative ou defina a licença antes de liberar o acesso.'), { status: 409 });
    const users = await db.query('SELECT * FROM users WHERE lower(email)=lower($1) FOR UPDATE', [account.email]);
    let owner = users.rows[0];
    if (owner && owner.client_account_id !== account.id) throw Object.assign(new Error('O e-mail do responsável pertence a outra conta.'), { status: 409 });
    if (!owner) {
      const inserted = await db.query(`INSERT INTO users(id,client_account_id,email,name,provider,password_hash,global_role,active,created_at,updated_at)
        VALUES($1,$2,$3,$4,'password','LOCKED_PENDING_ACTIVATION','admin',false,now(),now()) RETURNING *`,
        [randomUUID(), account.id, account.email.toLowerCase(), account.contact_name || account.trade_name]);
      owner = inserted.rows[0];
    }
    const passwordConfigured = Boolean((owner.provider !== 'password' && owner.active) || (owner.password_hash && owner.password_hash !== 'LOCKED_PENDING_ACTIVATION'));
    const status = passwordConfigured ? 'acesso_ativado' : 'acesso_pendente';
    let rawToken: string | null = null;
    if (!passwordConfigured) {
      rawToken = randomBytes(32).toString('hex');
      await db.query("UPDATE auth_tokens SET used_at=now() WHERE lower(email)=lower($1) AND type='activation' AND used_at IS NULL", [account.email]);
      await db.query(`INSERT INTO auth_tokens(id,token_hash,type,email,client_id,name,expires_at,created_at)
        VALUES($1,$2,'activation',$3,$4,$5,now()+interval '48 hours',now())`,
        [randomUUID(), createHash('sha256').update(rawToken).digest('hex'), account.email.toLowerCase(), account.id, account.contact_name || account.trade_name]);
    } else {
      await db.query('UPDATE users SET active=true,updated_at=now() WHERE id=$1', [owner.id]);
    }
    await db.query(`INSERT INTO user_stores(id,user_id,store_id,role,is_default,created_at)
      VALUES($1,$2,$3,'admin',true,now()) ON CONFLICT(user_id,store_id) DO NOTHING`, [randomUUID(), owner.id, store.id]);
    await ensureOwnerTeamMember(db,owner.id,store.id);
    await db.query("UPDATE client_accounts SET status='active',updated_at=now() WHERE id=$1", [account.id]);
    await db.query('UPDATE stores SET active=true,updated_at=now() WHERE id=$1', [store.id]);
    await db.query("UPDATE store_licenses SET status='active',updated_at=now() WHERE id=$1", [license.id]);
    const event = JSON.stringify([{ status, timestamp: new Date().toISOString(), detail: `Pagamento confirmado manualmente por ${input.actorId}` }]);
    try {
      await db.query(`UPDATE partner_signups SET status=$1,payment_confirmed_at=now(),payment_method=$2,transaction_ref=$3,
        audit_trail=COALESCE(audit_trail,'[]'::jsonb)||$4::jsonb,updated_at=now()
        WHERE id=$5 OR (document=$6 AND $6<>'')`, [status,input.paymentMethod,input.transactionRef || null,event,account.id,account.document]);
    } catch {
      try {
        await db.query(`UPDATE partner_signups SET payment_confirmed_at=now(),payment_method=$1,transaction_ref=$2,updated_at=now()
          WHERE id=$3 OR (document=$4 AND $4<>'')`, [input.paymentMethod,input.transactionRef || null,account.id,account.document]);
      } catch {
        // safe fallback if partner_signups is missing or restricted
      }
    }
    await db.query(`INSERT INTO client_payment_confirmations(client_account_id,store_id,payment_method,transaction_ref,notes,confirmed_by,contracting_status)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (client_account_id) DO UPDATE SET contracting_status=EXCLUDED.contracting_status, confirmed_at=now()`, [account.id,store.id,input.paymentMethod,input.transactionRef || null,input.notes || '',input.actorId,status]);
    await db.query('COMMIT');
    return { account, alreadyProcessed: false, status, rawToken, monthlyAmount: Number(license.final_price), planId: license.plan_id };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
