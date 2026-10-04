import { useEffect, useState } from 'react';
import { AdminPicker } from './AdminPicker';
import { ATTRIBUTES_EVENT, getAttributes, hydrateAttributesFromApi, type PickedAttribute, type ProductAttribute } from '../data/attributeStore';
import { STORE_CONTEXT_CHANGED_EVENT } from '../data/multiStoreStore';

export function SaleAttributeFields({ surface, picked = [], product, onChange }: {
 surface: 'pdv' | 'external'; picked?: PickedAttribute[];
 product?: { attrs?: Record<string, unknown>; color?: string; capacity?: string };
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
   const options=Array.isArray(configured) ? configured.map(String) : typeof configured==='string' && configured ? [configured] : legacy ? [legacy] : attr.values;
   return <div key={attr.id} style={{flex:'1 1 150px',minWidth:0}}><AdminPicker label={attr.name} value={picked.find(p=>p.id===attr.id)?.value || ''} options={[{value:'',label:'Selecionar'},...options.map(value=>({value,label:value}))]} onChange={value=>onChange([...picked.filter(p=>p.id!==attr.id),...(value ? [{id:attr.id,name:attr.name,value}] : [])])}/></div>;
  })}
 </div>;
}
