import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const attributesRouter = Router();
const schema = z.object({
 name: z.string().trim().min(1), values: z.array(z.string().trim().min(1)).default([]),
 priceDeltas: z.record(z.coerce.number()).default({}), useOnTotem: z.boolean().default(true),
 filterOnTotem: z.boolean().default(false), useOnStock: z.boolean().default(true),
 sort: z.coerce.number().default(0), active: z.boolean().default(true),
});
async function list(storeId: string) {
 if (!pool) throw new Error('Banco de dados indisponível.');
 const rows = await pool.query(`SELECT a.*, COALESCE(jsonb_agg(jsonb_build_object('value',v.value,'delta',v.price_delta) ORDER BY v.sort,v.id) FILTER (WHERE v.id IS NOT NULL),'[]') AS options FROM product_attributes a LEFT JOIN product_attribute_values v ON v.attribute_id=a.id WHERE a.store_id=$1 GROUP BY a.id ORDER BY a.sort,a.name`,[storeId]);
 return rows.rows.map(a=>({id:a.id,name:a.name,values:a.options.map((v:any)=>v.value),priceDeltas:Object.fromEntries(a.options.map((v:any)=>[v.value,Number(v.delta)])),useOnTotem:a.use_on_totem,filterOnTotem:a.filter_on_totem,useOnStock:a.use_on_stock,sort:a.sort,active:a.active}));
}
async function automation(storeId: string, enabled?: boolean) {
 if (!pool) throw new Error('Banco de dados indisponível.');
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  const r=await c.query('SELECT segment,attribute_automation_enabled FROM stores WHERE id=$1 FOR UPDATE',[storeId]);
  if (!r.rows[0]) throw new Error('Loja não encontrada.');
  if (enabled!==undefined) await c.query('UPDATE stores SET attribute_automation_enabled=$2 WHERE id=$1',[storeId,enabled]);
  const active=enabled??r.rows[0].attribute_automation_enabled;
  const templates=await c.query('SELECT * FROM product_attribute_templates WHERE segment=$1 ORDER BY sort',[r.rows[0].segment]);
  if(active) for(const t of templates.rows) {
   const existing=await c.query('SELECT id FROM product_attributes WHERE store_id=$1 AND lower(name)=lower($2)',[storeId,t.name]);
   if(existing.rows.length) continue;
   const id=randomUUID();
   await c.query('INSERT INTO product_attributes(id,store_id,name,use_on_totem,filter_on_totem,use_on_stock,sort,active) VALUES($1,$2,$3,true,true,true,$4,true)',[id,storeId,t.name,t.sort]);
   for(const [sort,value] of t.values.entries()) await c.query('INSERT INTO product_attribute_values(id,attribute_id,value,price_delta,sort) VALUES($1,$2,$3,0,$4)',[randomUUID(),id,value,sort]);
  }
  await c.query('COMMIT');
  return {enabled:active,eligible:templates.rows.length>0,attributes:await list(storeId)};
 } catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();}
}
attributesRouter.get('/api/v1/attributes/automation',requireAuth,async(req,res,next)=>{try{res.json({success:true,data:await automation(req.storeId!)});}catch(e){next(e);}});
attributesRouter.put('/api/v1/attributes/automation',requireAuth,async(req,res,next)=>{try{const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);res.json({success:true,data:await automation(req.storeId!,enabled)});}catch(e){next(e);}});
attributesRouter.get('/api/v1/attributes',requireAuth,async(req,res,next)=>{try{res.json({success:true,data:(await automation(req.storeId!)).attributes});}catch(e){next(e);}});
async function save(req:any,res:any,next:any) {
 if(!pool){next(new Error('Banco de dados indisponível.'));return;}
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const id=req.params.id||randomUUID();
  const current=await c.query('SELECT * FROM product_attributes WHERE id=$1 AND store_id=$2 FOR UPDATE',[id,req.storeId]);
  if(req.params.id&&!current.rows.length){await c.query('ROLLBACK');res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Atributo não encontrado.'}});return;}
  let input=req.body;
  if(current.rows.length){const a=(await list(req.storeId)).find(a=>a.id===id);input={...a,...schema.partial().parse(req.body)};}
  const b=schema.parse(input);
  if(current.rows.length) await c.query('UPDATE product_attributes SET name=$3,use_on_totem=$4,filter_on_totem=$5,use_on_stock=$6,sort=$7,active=$8 WHERE id=$1 AND store_id=$2',[id,req.storeId,b.name,b.useOnTotem,b.filterOnTotem,b.useOnStock,b.sort,b.active]);
  else await c.query('INSERT INTO product_attributes(id,store_id,name,use_on_totem,filter_on_totem,use_on_stock,sort,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,req.storeId,b.name,b.useOnTotem,b.filterOnTotem,b.useOnStock,b.sort,b.active]);
  await c.query('DELETE FROM product_attribute_values WHERE attribute_id=$1',[id]);
  for(const [sort,value] of [...new Set(b.values)].entries()) await c.query('INSERT INTO product_attribute_values(id,attribute_id,value,price_delta,sort) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,value,b.priceDeltas[value]||0,sort]);
  await c.query('COMMIT');res.status(req.params.id?200:201).json({success:true,data:{...b,id}});
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}
}
attributesRouter.post('/api/v1/attributes',requireAuth,save);
attributesRouter.patch('/api/v1/attributes/:id',requireAuth,save);
attributesRouter.put('/api/v1/attributes/:id',requireAuth,save);
attributesRouter.delete('/api/v1/attributes/:id',requireAuth,async(req,res,next)=>{try{if(!pool)throw new Error('Banco de dados indisponível.');await pool.query('DELETE FROM product_attributes WHERE id=$1 AND store_id=$2',[req.params.id,req.storeId]);res.json({success:true,data:{ok:true}});}catch(e){next(e);}});
