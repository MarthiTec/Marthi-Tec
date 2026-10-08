import { canManageArea } from '../services/employeeAccess.js';
import {resolvePickup} from '../services/pickup.js';
import {unreservedQuantity} from '../services/commercialReservations.js';
import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool} from '../db/pool.js';
import {requireAuth} from '../middlewares/authMiddleware.js';
export const pickupRouter=Router();
pickupRouter.get('/api/v1/pickup-quote',requireAuth,async(req,res,next)=>{try{const q=z.object({stockId:z.string(),methodId:z.string()}).parse(req.query);const p=await resolvePickup(pool,req.storeId!,q.stockId,q.methodId,undefined,true);res.json({success:true,data:{unitPrice:p.unitPrice,estimatedDate:p.estimatedDate}});}catch(e){next(e);}});
const schema=z.object({name:z.string().trim().min(1).max(80),kind:z.enum(['immediate','order','delivery']),active:z.boolean(),leadDays:z.record(z.coerce.number().int().min(0).max(90)).refine(days=>Array.from({length:7},(_,i)=>String(i)).every(k=>days[k]!==undefined),'Informe o prazo de cada dia da semana.').optional()});
pickupRouter.get('/api/v1/pickup-methods',requireAuth,async(req,res,next)=>{try{res.json({success:true,data:(await pool.query('SELECT * FROM pickup_methods WHERE store_id=$1 ORDER BY kind,name',[req.storeId])).rows});}catch(e){next(e);}});
for(const method of ['post','put'] as const)pickupRouter[method]('/api/v1/pickup-methods'+(method==='put'?'/:id':''),requireAuth,async(req,res,next)=>{try{if(!canManageArea(req))throw Object.assign(new Error('Sem permissão.'),{status:403});const b=schema.parse(req.body);const id=req.params.id||randomUUID();const r=method==='post'?await pool.query('INSERT INTO pickup_methods(id,store_id,name,kind,active) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,req.storeId,b.name,b.kind,b.active]):await pool.query('UPDATE pickup_methods SET name=$3,kind=$4,active=$5 WHERE id=$1 AND store_id=$2 AND NOT EXISTS(SELECT 1 FROM pickup_requests WHERE method_id=$1 AND kind<>$4) RETURNING *',[id,req.storeId,b.name,b.kind,b.active]);if(!r.rows.length)throw Object.assign(new Error('Modalidade não encontrada ou possui histórico com outro tipo.'),{status:409});if(b.leadDays){if(!Array.from({length:7},(_,i)=>String(i)).every(k=>b.leadDays![k]!==undefined))throw Object.assign(new Error('Informe o prazo para cada dia da semana.'),{status:400});await pool.query('UPDATE pickup_methods SET lead_days=$3 WHERE id=$1 AND store_id=$2',[id,req.storeId,JSON.stringify(b.leadDays)]);}
res.json({success:true,data:r.rows[0]});}catch(e){next(e);}});
pickupRouter.delete('/api/v1/pickup-methods/:id',requireAuth,async(req,res,next)=>{try{if(!canManageArea(req))throw Object.assign(new Error('Sem permissão.'),{status:403});await pool.query('UPDATE pickup_methods SET active=false WHERE id=$1 AND store_id=$2',[req.params.id,req.storeId]);res.json({success:true,data:{ok:true}});}catch(e){next(e);}});
pickupRouter.get('/api/v1/pickup-requests',requireAuth,async(req,res,next)=>{try{res.json({success:true,data:(await pool.query('SELECT r.*,p.name AS method_name,s.name AS product_name FROM pickup_requests r JOIN pickup_methods p ON p.id=r.method_id JOIN stock_items s ON s.id=r.stock_id WHERE r.store_id=$1 ORDER BY r.created_at DESC',[req.storeId])).rows});}catch(e){next(e);}});
pickupRouter.patch('/api/v1/pickup-requests/:id',requireAuth,async(req,res,next)=>{const db=await pool.connect();try{
 if(!canManageArea(req))throw Object.assign(new Error('Sem permissão.'),{status:403});
 const {status}=z.object({status:z.enum(['ready','dispatched','completed','cancelled'])}).parse(req.body);await db.query('BEGIN');
 const r=(await db.query('SELECT * FROM pickup_requests WHERE id=$1 AND store_id=$2 FOR UPDATE',[req.params.id,req.storeId])).rows[0];
 if(!r)throw Object.assign(new Error('Pedido não encontrado.'),{status:404});
 const allowed=r.status==='waiting'?['ready']:r.status==='ready'?(r.kind==='delivery'?['dispatched']:['completed']):r.status==='dispatched'?['completed']:[];
 if(!allowed.includes(status))throw Object.assign(new Error('Transição de entrega inválida. Cancele vendas pelo fluxo de cancelamento.'),{status:409});
 const sale=(await db.query('SELECT id FROM sales_orders WHERE id=$1 AND store_id=$2 AND status<>$3',[r.reference_id,req.storeId,'cancelled'])).rows[0];
 if(!sale)throw Object.assign(new Error('Conclua a venda antes de disponibilizar o pedido.'),{status:409});
 if(r.kind==='order'&&sale&&(status==='ready'||status==='completed')){
  const stock=(await db.query('SELECT qty,cost FROM stock_items WHERE id=$1 AND store_id=$2 FOR UPDATE',[r.stock_id,req.storeId])).rows[0];
  const available=await unreservedQuantity(db,req.storeId!,r.stock_id,Number(stock.qty));
  if(available+(status==='completed'?r.qty:0)<r.qty)throw Object.assign(new Error('Estoque insuficiente para disponibilizar esta encomenda.'),{status:409});
  if(status==='completed'){
   const next=Number(stock.qty)-r.qty;
   await db.query('UPDATE stock_items SET qty=$3,updated_at=now() WHERE id=$1 AND store_id=$2',[r.stock_id,req.storeId,next]);
   await db.query(`INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,ref_id,operator_name,notes) VALUES($1,$2,$3,'sale',$4,$5,$6,$7,'pickup_delivery',$8,$9,'Retirada de encomenda')`,[randomUUID(),req.storeId,r.stock_id,r.qty,stock.qty,next,stock.cost,r.reference_id,req.user!.name]);
  }
 }
 await db.query('UPDATE pickup_requests SET status=$3,updated_at=now() WHERE id=$1 AND store_id=$2',[r.id,req.storeId,status]);await db.query('COMMIT');res.json({success:true,data:{status}});
 }catch(e){await db.query('ROLLBACK');next(e);}finally{db.release();}});
pickupRouter.get('/api/v1/pickup-tracking/:token',async(req,res,next)=>{try{const r=await pool.query('SELECT r.status,r.kind,r.estimated_date,r.updated_at,s.name AS product_name,p.name AS method_name FROM pickup_requests r JOIN stock_items s ON s.id=r.stock_id JOIN pickup_methods p ON p.id=r.method_id WHERE tracking_token=$1',[req.params.token]);if(!r.rows.length)throw Object.assign(new Error('Pedido não encontrado.'),{status:404});res.json({success:true,data:r.rows[0]});}catch(e){next(e);}});
