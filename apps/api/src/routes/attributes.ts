import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const attributesRouter = Router();
const schema = z.object({
 name: z.string().trim().min(1).max(100),
 values: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
 priceDeltas: z.record(z.coerce.number().finite()).default({}),
 useOnTotem: z.boolean().default(true), filterOnTotem: z.boolean().default(false),
 useOnStock: z.boolean().default(true), useOnPdv: z.boolean().default(true),
 useOnExternalSale: z.boolean().default(true), sort: z.coerce.number().int().default(0), active: z.boolean().default(true),
});
export function formatAttrResponse(row: any, values: any[]) {
 return { id: row.id, name: row.name, values: values.map(v => v.value),
 priceDeltas: Object.fromEntries(values.filter(v => Number(v.price_delta) !== 0).map(v => [v.value,Number(v.price_delta)])),
 useOnTotem: row.use_on_totem, filterOnTotem: row.filter_on_totem, useOnStock: row.use_on_stock,
 useOnPdv: row.use_on_pdv, useOnExternalSale: row.use_on_external_sale, sort: row.sort, active: row.active };
}
async function read(db: Pick<PoolClient,'query'>,storeId: string,id?: string) {
 const result=await db.query(`SELECT * FROM product_attributes WHERE store_id=$1 ${id ? 'AND id=$2' : ''} ORDER BY sort,name`,id ? [storeId,id] : [storeId]);
 return Promise.all(result.rows.map(async row=>formatAttrResponse(row,(await db.query('SELECT value,price_delta FROM product_attribute_values WHERE attribute_id=$1 ORDER BY sort,id',[row.id])).rows)));
}
async function writeValues(db: PoolClient,id: string,values: string[],deltas: Record<string,number>) {
 const unique=[...new Set(values)];
 // Preserve identifiers of unchanged values referenced by product configurations.
 await db.query('DELETE FROM product_attribute_values WHERE attribute_id=$1 AND NOT (value=ANY($2::text[]))',[id,unique]);
 for(const [sort,value] of unique.entries()) await db.query(`INSERT INTO product_attribute_values(id,attribute_id,value,price_delta,sort) VALUES($1,$2,$3,$4,$5) ON CONFLICT(attribute_id,value) DO UPDATE SET price_delta=excluded.price_delta,sort=excluded.sort`,[`ATV-${randomUUID()}`,id,value,deltas[value] ?? 0,sort]);
}
function canEdit(req: any,res: any) {
 if(['admin','manager','superadmin'].includes(req.user?.role)) return true;
 res.status(403).json({success:false,error:{code:'FORBIDDEN',message:'Sem permissão para alterar atributos.'}}); return false;
}
function missing(res: any) { return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Atributo não encontrado nesta loja.'}}); }
attributesRouter.get('/api/v1/attributes',requireAuth,async(req,res,next)=>{
 try { res.json({success:true,data:await read(pool,req.storeId!)}); } catch(e) { next(e); }
});
attributesRouter.post('/api/v1/attributes/replicate',requireAuth,async(req,res,next)=>{
 if(!canEdit(req,res)) return;
 let db: PoolClient | undefined;
 try {
  const {targetStoreId}=z.object({targetStoreId:z.string().min(1)}).parse(req.body);
  if(targetStoreId===req.storeId) throw Object.assign(new Error('Escolha outra filial.'),{status:400});
  db=await pool.connect(); await db.query('BEGIN');
  const allowed=await db.query(`SELECT s.id FROM stores s JOIN user_stores u ON u.store_id=s.id
   WHERE s.id=$1 AND s.client_account_id=$2 AND s.active=true AND s.is_matrix=false
    AND u.user_id=$3 AND u.role IN ('admin','manager','superadmin')`,[targetStoreId,req.clientAccountId,req.user!.id]);
  if(!allowed.rows.length) throw Object.assign(new Error('Filial não disponível para cópia.'),{status:403});
  await db.query('SELECT id FROM stores WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[[req.storeId,targetStoreId]]);
  const source=await read(db,req.storeId!); const target=await read(db,targetStoreId);
  const missingAttributes=source.filter(attr=>!target.some(other=>other.name.trim().toLowerCase()===attr.name.trim().toLowerCase()));
  if(target.length+missingAttributes.length>5) throw Object.assign(new Error('A filial ultrapassaria o limite de 5 atributos. Ajuste os cadastros antes de copiar.'),{status:409});
  for(const attr of missingAttributes) {
   const id=`ATTR-${randomUUID()}`;
   await db.query(`INSERT INTO product_attributes(id,store_id,name,use_on_totem,filter_on_totem,use_on_stock,use_on_pdv,use_on_external_sale,sort,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,targetStoreId,attr.name,attr.useOnTotem,attr.filterOnTotem,attr.useOnStock,attr.useOnPdv,attr.useOnExternalSale,attr.sort,attr.active]);
   await writeValues(db,id,attr.values,attr.priceDeltas);
  }
  await db.query('COMMIT'); res.json({success:true,data:{copied:missingAttributes.length,preserved:source.length-missingAttributes.length}});
 } catch(e) { if(db) await db.query('ROLLBACK'); next(e); } finally { db?.release(); }
});
attributesRouter.post('/api/v1/attributes',requireAuth,async(req,res,next)=>{
 if(!canEdit(req,res)) return;
 let db: PoolClient | undefined;
 try {
  const body=schema.parse(req.body); const id=`ATTR-${randomUUID()}`;
  db=await pool.connect(); await db.query('BEGIN');
  await db.query('SELECT id FROM stores WHERE id=$1 FOR UPDATE',[req.storeId]);
  const count=await db.query('SELECT count(*)::int AS count FROM product_attributes WHERE store_id=$1',[req.storeId]);
  if(count.rows[0].count>=5) { await db.query('ROLLBACK'); res.status(409).json({success:false,error:{code:'ATTRIBUTE_LIMIT',message:'Máximo de 5 atributos por loja.'}}); return; }
  await db.query(`INSERT INTO product_attributes(id,store_id,name,use_on_totem,filter_on_totem,use_on_stock,use_on_pdv,use_on_external_sale,sort,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,req.storeId,body.name,body.useOnTotem,body.filterOnTotem,body.useOnStock,body.useOnPdv,body.useOnExternalSale,body.sort,body.active]);
  await writeValues(db,id,body.values,body.priceDeltas);
  const [record]=await read(db,req.storeId!,id); await db.query('COMMIT');
  res.status(201).json({success:true,data:record});
 } catch(e) { if(db) await db.query('ROLLBACK'); next(e); } finally { db?.release(); }
});
async function update(req: any,res: any,next: any) {
 if(!canEdit(req,res)) return;
 let db: PoolClient | undefined;
 try {
  const patch=schema.partial().parse(req.body); db=await pool.connect(); await db.query('BEGIN');
  const current=await db.query('SELECT * FROM product_attributes WHERE id=$1 AND store_id=$2 FOR UPDATE',[req.params.id,req.storeId]);
  if(!current.rows[0]) { await db.query('ROLLBACK'); missing(res); return; }
  const [old]=await read(db,req.storeId,req.params.id); const body={...old,...patch};
  await db.query(`UPDATE product_attributes SET name=$3,use_on_totem=$4,filter_on_totem=$5,use_on_stock=$6,use_on_pdv=$7,use_on_external_sale=$8,sort=$9,active=$10 WHERE id=$1 AND store_id=$2`,[req.params.id,req.storeId,body.name,body.useOnTotem,body.filterOnTotem,body.useOnStock,body.useOnPdv,body.useOnExternalSale,body.sort,body.active]);
  if(patch.values!==undefined || patch.priceDeltas!==undefined) await writeValues(db,req.params.id,body.values,body.priceDeltas);
  const [record]=await read(db,req.storeId,req.params.id); await db.query('COMMIT'); res.json({success:true,data:record});
 } catch(e) { if(db) await db.query('ROLLBACK'); next(e); } finally { db?.release(); }
}
attributesRouter.patch('/api/v1/attributes/:id',requireAuth,update);
attributesRouter.put('/api/v1/attributes/:id',requireAuth,update);
attributesRouter.delete('/api/v1/attributes/:id',requireAuth,async(req,res,next)=>{
 if(!canEdit(req,res)) return;
 try { const result=await pool.query('DELETE FROM product_attributes WHERE id=$1 AND store_id=$2 RETURNING id',[req.params.id,req.storeId]); if(!result.rows[0]) { missing(res); return; } res.json({success:true,data:{ok:true}}); } catch(e) { next(e); }
});
