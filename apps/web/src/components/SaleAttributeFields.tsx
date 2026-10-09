import { useEffect, useState } from 'react';
import { AdminPicker } from './AdminPicker';
import { ATTRIBUTES_EVENT, getAttributes, hydrateAttributesFromApi, type PickedAttribute, type ProductAttribute } from '../data/attributeStore';
import { STORE_CONTEXT_CHANGED_EVENT } from '../data/multiStoreStore';
import { CONDITION_ATTR_ID, CONDITION_LABEL, conditionCode, productConditionChoices } from '../data/productCondition';

const valueKey=(value: string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,'');
function uniqueValues(values: string[]) {
 const seen=new Set<string>();
 return values.filter(value=>{const key=valueKey(value);if(!key||seen.has(key))return false;seen.add(key);return true;});
}

export function SaleAttributeFields({ surface, picked = [], product, onChange }: {
 surface: 'pdv' | 'external'; picked?: PickedAttribute[];
 product?: { attrs?: Record<string, unknown>; color?: string; capacity?: string; variations?: Array<{ attrs?: Record<string, unknown>; condition?: string }> };
 onChange: (picked: PickedAttribute[]) => void;
}) {
 const [attributes,setAttributes]=useState<ProductAttribute[]>(getAttributes);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  const refresh=()=>{ if(alive) setAttributes(getAttributes()); };
  const reload=()=>{ setAttributes([]); setError(''); void hydrateAttributesFromApi().then(refresh).catch(()=>{ if(alive) setError('Não foi possível carregar os atributos. Tente novamente.'); }); };
  reload(); window.addEventListener(ATTRIBUTES_EVENT,refresh); window.addEventListener(STORE_CONTEXT_CHANGED_EVENT,reload);
  return()=>{alive=false;window.removeEventListener(ATTRIBUTES_EVENT,refresh);window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT,reload);};
 },[]);
 return <div style={{display:'flex',flexWrap:'wrap',gap:12,width:'100%',gridColumn:'1 / -1'}}>
  {error && <p role="alert">{error}</p>}
  {attributes.filter(a=>a.active && (surface==='pdv' ? a.useOnPdv!==false : a.useOnExternalSale!==false)).map(attr=>{
   const configured=product?.attrs?.[attr.id];
   const legacy=attr.name.toLowerCase()==='cor' ? product?.color : attr.name.toLowerCase()==='capacidade' ? product?.capacity : '';
   // Primeiro o que o produto tem (grade, atributos, cor/capacidade antigos), depois o resto do atributo:
   // dá para vender por encomenda uma cor que a loja ainda não tem; o valor novo é criado no atributo.
   const fromVariations=(product?.variations??[]).map(v=>v.attrs?.[attr.id]).filter((v):v is string=>typeof v==='string'&&Boolean(v));
   const fromProduct=Array.isArray(configured) ? configured.map(String) : typeof configured==='string' && configured ? [configured] : legacy ? [legacy] : [];
   const options=uniqueValues([...fromVariations,...fromProduct,...attr.values]);
   return <div key={attr.id} style={{flex:'1 1 150px',minWidth:0}}><AdminPicker label={attr.name} value={picked.find(p=>p.id===attr.id)?.value || ''} options={[{value:'',label:'Selecionar'},...options.map(value=>({value,label:value}))]} onChange={value=>onChange([...picked.filter(p=>p.id!==attr.id),...(value ? [{id:attr.id,name:attr.name,value}] : [])])}/></div>;
  })}
  {/* Grade com novo e usado da mesma cor/capacidade: a condição escolhe a variação (preço e estoque). */}
  {productConditionChoices(product).length ? <div style={{flex:'1 1 150px',minWidth:0}}><AdminPicker label="Condição" value={conditionCode(picked.find(p=>p.id===CONDITION_ATTR_ID)?.value) || ''} options={[{value:'',label:'Selecionar'},...productConditionChoices(product).map(code=>({value:code,label:CONDITION_LABEL[code]}))]} onChange={value=>{const code=conditionCode(value);onChange([...picked.filter(p=>p.id!==CONDITION_ATTR_ID),...(code ? [{id:CONDITION_ATTR_ID,name:'Condição',value:CONDITION_LABEL[code]}] : [])]);}}/></div> : null}
 </div>;
}
