import type { PoolClient } from 'pg';
import { z } from 'zod';
export const pickedAttributeSchema=z.array(z.object({id:z.string().min(1),name:z.string().max(100),value:z.string().min(1).max(100)})).max(5).default([]);
export async function validateSaleAttributes(db: PoolClient,storeId: string,lines: {stockId?:string|null;attributes?:{id:string;name:string;value:string}[]}[],surface:'pdv'|'external'|'totem') {
 for(const line of lines) {
  const ids=new Set<string>();
  for(const picked of line.attributes ?? []) {
   if(ids.has(picked.id)) throw Object.assign(new Error('Atributo repetido no item.'),{status:400});
   ids.add(picked.id);
   const result=await db.query(`SELECT a.name,v.value FROM product_attributes a LEFT JOIN product_attribute_values v ON v.attribute_id=a.id WHERE a.id=$1 AND a.store_id=$2 AND a.active=true AND ${surface==='pdv' ? 'a.use_on_pdv' : surface==='totem' ? 'a.use_on_totem' : 'a.use_on_external_sale'}=true`,[picked.id,storeId]);
   if(!result.rows.length) throw Object.assign(new Error('Atributo não disponível nesta loja.'),{status:400});
   let values=result.rows.map(row=>row.value);
   if(line.stockId) {
    const stock=(await db.query('SELECT attrs,color,capacity FROM stock_items WHERE id=$1 AND store_id=$2',[line.stockId,storeId])).rows[0];
    if(stock) {
     const mapped=stock.attrs?.[picked.id]; const name=result.rows[0].name.toLowerCase();
     const legacy=name==='cor' ? stock.color : name==='capacidade' ? stock.capacity : '';
     if(Array.isArray(mapped) && mapped.length) values=mapped;
     else if(typeof mapped==='string' && mapped) values=[mapped];
     else if(legacy) values=[legacy];
    }
   }
   if(!values.includes(picked.value)) throw Object.assign(new Error('Valor do atributo não disponível para este produto.'),{status:400});
   picked.name=result.rows[0].name;
  }
 }
}
