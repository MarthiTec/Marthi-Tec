import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
export const addressSchema=z.object({zipCode:z.string().trim().min(8),street:z.string().trim().min(1),number:z.string().trim().min(1),district:z.string().trim().min(1),city:z.string().trim().min(1),state:z.string().trim().length(2),complement:z.string().trim().optional()});
export const pickupSelection={pickupMethodId:z.string().optional(),deliveryAddress:addressSchema.optional(),sourceTicketId:z.string().optional()};
export async function resolvePickup(db:Pick<PoolClient,'query'>,storeId:string,stockId:string,methodId:string,address?:unknown,quoteOnly=false){
 const r=await db.query(`SELECT p.*,s.price,s.pickup_prices,s.qty FROM pickup_methods p JOIN stock_items s ON s.store_id=p.store_id WHERE p.id=$1 AND p.store_id=$2 AND p.active=true AND s.id=$3 AND s.active=true`,[methodId,storeId,stockId]);
 const p=r.rows[0];if(!p)throw Object.assign(new Error('Retirada ou produto indisponível nesta loja.'),{status:400});
 if(p.pickup_prices[p.id]===null)throw Object.assign(new Error('Modalidade não disponível para este produto.'),{status:400});
 if(!quoteOnly&&p.kind!=='order'&&Number(p.qty)<1)throw Object.assign(new Error('Produto sem estoque para retirada imediata ou entrega.'),{status:400});
 const deliveryAddress=p.kind==='delivery'&&!quoteOnly?addressSchema.parse(address):null;
 return {...p,deliveryAddress,estimatedDate:p.kind==='order'?estimatedPickupDate(p.lead_days):null,unitPrice:Number(p.pickup_prices[p.id]??p.price)};
}
export async function validatePickupLines(db:PoolClient,storeId:string,lines:any[]){
 for(const l of lines)if(l.pickupMethodId){if(!l.stockId)throw Object.assign(new Error('Escolha o produto da loja.'),{status:400});const p=await resolvePickup(db,storeId,l.stockId,l.pickupMethodId,l.deliveryAddress);l.unitPrice=p.unitPrice;l.pickupKind=p.kind;l.deliveryAddress=p.deliveryAddress;}
}
export async function recordPickup(db:Pick<PoolClient,'query'>,storeId:string,reference:string,customer:any,line:any){
 if(!line.pickupMethodId)return;
 const p=await resolvePickup(db,storeId,line.stockId,line.pickupMethodId,line.deliveryAddress,true);
 p.deliveryAddress=p.kind==='delivery'?addressSchema.parse(line.deliveryAddress):null;
 if(line.sourceTicketId){
  const ticket=(await db.query('SELECT id FROM pos_tickets WHERE id=$1 AND store_id=$2 AND status=$3 FOR UPDATE',[line.sourceTicketId,storeId,'open'])).rows[0];
  if(!ticket)throw Object.assign(new Error('Pedido do Totem indisponível ou já atendido.'),{status:409});
  const existing=(await db.query('SELECT * FROM pickup_requests WHERE reference_id=$1 AND store_id=$2 AND stock_id=$3 AND method_id=$4 FOR UPDATE',[line.sourceTicketId,storeId,line.stockId,p.id])).rows[0];
  if(existing){
   await db.query('UPDATE pickup_requests SET reference_id=$3,customer_name=$4,customer_phone=$5,address=$6,price=$7,qty=$8,status=$9,estimated_date=$10,updated_at=now() WHERE id=$1 AND store_id=$2',[existing.id,storeId,reference,customer.customerName,customer.customerPhone||'',p.deliveryAddress?JSON.stringify(p.deliveryAddress):null,line.unitPrice,line.qty||1,p.kind==='immediate'?'completed':'waiting',p.estimatedDate]);
   await db.query('UPDATE pos_tickets SET status=$3 WHERE id=$1 AND store_id=$2',[line.sourceTicketId,storeId,'sold']);
   return existing.tracking_token;
  }
  await db.query('UPDATE pickup_requests SET status=$3,updated_at=now() WHERE reference_id=$1 AND store_id=$2',[line.sourceTicketId,storeId,'cancelled']);
  await db.query('UPDATE pos_tickets SET status=$3 WHERE id=$1 AND store_id=$2',[line.sourceTicketId,storeId,'sold']);
 }
 const token=randomUUID();await db.query(`INSERT INTO pickup_requests(id,store_id,method_id,stock_id,reference_id,customer_name,customer_phone,address,price,qty,kind,status,tracking_token,estimated_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[randomUUID(),storeId,p.id,line.stockId,reference,customer.customerName,customer.customerPhone||'',p.deliveryAddress?JSON.stringify(p.deliveryAddress):null,p.unitPrice,line.qty||1,p.kind,p.kind==='immediate'&&reference.startsWith('TCK-')===false?'completed':'waiting',token,p.estimatedDate]);return token;
}
export async function validatePickupPrices(db:Pick<PoolClient,'query'>,storeId:string,prices:Record<string,number|null>){
 const ids=Object.keys(prices);if(!ids.length)return;
 const r=await db.query('SELECT id FROM pickup_methods WHERE store_id=$1 AND id=ANY($2::text[])',[storeId,ids]);if(r.rows.length!==ids.length)throw Object.assign(new Error('Modalidade de outra loja ou inexistente.'),{status:400});
}

export function estimatedPickupDate(policy:Record<string,number>,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 const date=new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
 const days=Number(policy[String(date.getUTCDay())]);
 if(!Number.isInteger(days)||days<0||days>90)throw new Error('Prazo de encomenda inválido.');
 date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
