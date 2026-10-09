import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ensureAttributeValue } from './attributeValues.js';
import { CONDITION_ATTR_ID, CONDITION_LABEL, conditionCode } from './productCondition.js';
export const pickedAttributeSchema=z.array(z.object({id:z.string().min(1),name:z.string().max(100),value:z.string().min(1).max(100)})).max(5).default([]);
/**
 * Confere os atributos escolhidos na venda (cor, capacidade…). O valor escolhido nunca trava a venda:
 * se já existe no atributo (mesmo escrito diferente, "256GB" x "256 GB") usa o cadastrado; se não
 * existe (ex.: encomenda de uma cor que a loja ainda não tem), é criado no atributo da loja.
 */
export async function validateSaleAttributes(db: PoolClient,storeId: string,lines: {stockId?:string|null;attributes?:{id:string;name:string;value:string}[]}[],surface:'pdv'|'external'|'totem') {
 for(const line of lines) {
  const ids=new Set<string>();
  for(const picked of line.attributes ?? []) {
   if(ids.has(picked.id)) throw Object.assign(new Error('Atributo repetido no item.'),{status:400});
   ids.add(picked.id);
   // Condição do aparelho (novo/usado/recondicionado): escolha da venda, não é atributo cadastrado.
   if(picked.id===CONDITION_ATTR_ID){
    const code=conditionCode(picked.value);
    if(!code) throw Object.assign(new Error('Condição do aparelho inválida.'),{status:400});
    picked.value=CONDITION_LABEL[code];
    picked.name='Condição';
    continue;
   }
   const result=await db.query(`SELECT a.name FROM product_attributes a WHERE a.id=$1 AND a.store_id=$2 AND a.active=true AND ${surface==='pdv' ? 'a.use_on_pdv' : surface==='totem' ? 'a.use_on_totem' : 'a.use_on_external_sale'}=true`,[picked.id,storeId]);
   if(!result.rows.length) throw Object.assign(new Error('Atributo não disponível nesta loja.'),{status:400});
   picked.value=await ensureAttributeValue(db,storeId,picked.id,picked.value);
   picked.name=result.rows[0].name;
  }
 }
}
