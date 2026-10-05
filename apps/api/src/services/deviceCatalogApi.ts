import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {pool} from '../db/pool.js';
import {env} from '../config/env.js';
import {normalizeDeviceText,type DeviceReference} from './deviceReference.js';
const encryptionKey=()=>createHash('sha256').update('device-catalog:'+env.JWT_SECRET).digest();
export function encryptCatalogKey(value:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');}
export function decryptCatalogKey(value:string){const [iv,tag,payload]=value.split('.');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(payload,'base64')),decipher.final()]).toString('utf8');}
export function parseDeviceSpecs(raw:any,sourceUrl:string):DeviceReference&{specifications:any;fetchedAt:string}{
 const data=raw?.data??raw;if(Array.isArray(data)&&data.length!==1)throw new Error('O fornecedor retornou mais de um modelo. Informe o nome completo.');const item=Array.isArray(data)?data[0]:data;
 if(!item||typeof item!=='object')throw new Error('Resposta de especificações inválida.');
 const brand=String(item.manufacturer??item.brand??'').trim();const model=String(item.model??item.phone_name??'').trim();
 if(!brand||!model)throw new Error('O fornecedor não informou marca e modelo.');
 const colors=[...new Set((Array.isArray(item.colors)?item.colors:typeof item.colors==='string'?item.colors.split(','):[]).map((v:any)=>String(v).trim()).filter(Boolean))] as string[];
 const memory=item.normalizedSpecs?.memoryOptions??item.normalized_specs?.memory_options;
 let capacities:string[]=[];
 if(Array.isArray(memory?.availableStorageGb??memory?.available_storage_gb))capacities=(memory.availableStorageGb??memory.available_storage_gb).filter((n:any)=>Number.isFinite(Number(n))&&Number(n)>0).map((n:any)=>Number(n)>=1024&&Number(n)%1024===0?Number(n)/1024+'TB':Number(n)+'GB');
 else capacities=[...String(item.internalRaw??item.internal_raw??'').matchAll(/(\d+)\s*(GB|TB)(?!\s*RAM)\b/gi)].map(m=>m[1]+m[2].toUpperCase());
 return {brand,model,colors,capacities:[...new Set(capacities)],sourceUrl,specifications:item,fetchedAt:new Date().toISOString()};
}
const pending=new Map<string,Promise<any>>();
export async function loadCatalogDevice(storeId:string,name:string,brandQuery=''){
 const brands=(await pool.query('SELECT name,aliases,strip_aliases FROM device_catalog_brands')).rows;
 const norm=normalizeDeviceText(name);const selected=normalizeDeviceText(brandQuery);
 const brand=brands.find(b=>selected&&(normalizeDeviceText(b.name)===selected||b.aliases.includes(selected)))??brands.find(b=>b.aliases.some((a:string)=>norm===a||norm.startsWith(a+' ')));
 if(!brand)return null;
 let model=name.trim();for(const alias of brand.strip_aliases as string[])if(normalizeDeviceText(model).startsWith(alias+' ')){model=model.slice(alias.length).trim();break;}
 if(normalizeDeviceText(model).length<3)return null;
 const settings=(await pool.query('SELECT s.*,p.base_url,p.adapter FROM device_catalog_settings s JOIN device_catalog_providers p ON p.id=s.provider_id AND p.active=true WHERE s.store_id=$1',[storeId])).rows[0];
 if(!settings?.enabled||!settings.api_key_encrypted)throw Object.assign(new Error('Configure a chave da API de aparelhos para consultar esta marca.'),{status:409});
 const queryKey=normalizeDeviceText(brand.name+' '+model);
 const saved=(await pool.query('SELECT data,refreshed_at FROM device_catalog_models WHERE store_id=$1 AND provider_id=$2 AND query_key=$3',[storeId,settings.provider_id,queryKey])).rows[0];
 if(saved&&Date.now()-new Date(saved.refreshed_at).getTime()<settings.cache_days*86400000)return saved.data;
 const requestKey=storeId+':'+settings.provider_id+':'+queryKey;
 if(!pending.has(requestKey))pending.set(requestKey,(async()=>{
  const base=new URL(settings.base_url);if(base.protocol!=='https:'||base.hostname!=='deviceultraparser.p.rapidapi.com')throw new Error('Endereço do fornecedor inválido.');
  const sourceUrl=base.href.replace(/\/$/,'')+'/clean/getspecs/'+encodeURIComponent(brand.name)+'/'+encodeURIComponent(model);
  const response=await fetch(sourceUrl,{headers:{'x-rapidapi-key':decryptCatalogKey(settings.api_key_encrypted),'x-rapidapi-host':base.hostname,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(response.status===404)return null;
  if(!response.ok)throw Object.assign(new Error(response.status===401||response.status===403?'A chave da API de aparelhos não foi aceita.':response.status===429?'Limite de consultas da API atingido. Tente novamente mais tarde.':'Não foi possível consultar a API de aparelhos.'),{status:502});
  const raw=await response.json();const device=parseDeviceSpecs(raw,sourceUrl);
  if(normalizeDeviceText(device.brand)!==normalizeDeviceText(brand.name)||normalizeDeviceText(device.model)!==normalizeDeviceText(model))throw Object.assign(new Error('A API retornou outro modelo. Confira o nome completo do aparelho.'),{status:422});
  await pool.query('INSERT INTO device_catalog_models(store_id,provider_id,query_key,data,raw_data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(store_id,provider_id,query_key) DO UPDATE SET data=EXCLUDED.data,raw_data=EXCLUDED.raw_data,refreshed_at=now()',[storeId,settings.provider_id,queryKey,JSON.stringify(device),JSON.stringify(raw)]);
  return device;
 })().finally(()=>pending.delete(requestKey)));
 try{return await pending.get(requestKey);}catch(error){if(saved)return {...saved.data,stale:true};throw error;}
}
