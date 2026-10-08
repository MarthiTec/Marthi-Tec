import {useEffect,useState} from 'react';
import {nestRequest} from '../services/nestClient';
import {AdminPicker} from './AdminPicker';
import {usePickupMethods,type DeliveryAddress,type PickupMethod} from '../data/pickup';
import {CurrencyInput} from './CurrencyInput';
import './pickupPriceList.css';
export function PickupFields({product,methodId,address,onChange,publicMode=false}:{product?:{id?:string;pickupPrices?:Record<string,number|null>;price?:number;allowedPickupMethodIds?:string[]};methodId?:string;address?:DeliveryAddress;onChange:(methodId:string,address?:DeliveryAddress,price?:number)=>void;publicMode?:boolean}){
 const {methods,error}=usePickupMethods(publicMode);
 const prices=product?.pickupPrices??{};const available=methods.filter(m=>m.active&&(product?.allowedPickupMethodIds?product.allowedPickupMethodIds.includes(m.id):Object.keys(prices).length?Object.hasOwn(prices,m.id)&&prices[m.id]!==null:m.kind==='immediate'));const method=available.find(m=>m.id===methodId);
 const [estimatedDate,setEstimatedDate]=useState<string>();
 const [quoteError,setQuoteError]=useState('');
 useEffect(()=>{let alive=true;setEstimatedDate(undefined);setQuoteError('');if(method?.kind==='order'&&product?.id){void nestRequest<{estimatedDate:string}>(`${publicMode?'/totem/pickup-quote':'/pickup-quote'}?stockId=${encodeURIComponent(product.id)}&methodId=${encodeURIComponent(method.id)}`).then(q=>{if(alive)setEstimatedDate(q.estimatedDate);}).catch(e=>{if(alive)setQuoteError(e.message);});}return()=>{alive=false;};},[method?.id,product?.id,publicMode]);
 return <div className="pickup-fields"><AdminPicker label="Tipo de retirada" value={methodId||''} options={[{value:'',label:'Selecionar'},...available.map(m=>({value:m.id,label:m.name}))]} onChange={id=>onChange(id,undefined,product?.pickupPrices?.[id]??product?.price)}/>
 {(error||quoteError)&&<p role="alert">{error||quoteError}</p>}
 {method?.kind==='order'&&(()=>{const when=estimatedDate?new Date(estimatedDate+'T12:00:00').toLocaleDateString('pt-BR'):quoteError?'indisponível no momento':'consultando…';const full=`Previsão de chegada: ${when}. Você poderá acompanhar quando o aparelho estiver disponível para retirada.`;
  // No painel a previsão fica numa dica (passar o mouse ou tocar); no totem o cliente vê o texto inteiro.
  return publicMode?<p>{full}</p>:<span className="pickup-hint" tabIndex={0} role="note" aria-label={full}><span aria-hidden>ⓘ</span> Chega {when}<span className="pickup-hint__bubble" aria-hidden>{full}</span></span>;})()}
 {method?.kind==='delivery'&&<div className="admin-form">{(['zipCode','street','number','district','city','state','complement'] as const).map((key,index)=><label key={key}>{['CEP','Rua','Número','Bairro','Cidade','UF','Complemento'][index]}<input required={key!=='complement'} value={address?.[key]||''} maxLength={key==='state'?2:120} onChange={e=>onChange(method.id,{zipCode:'',street:'',number:'',district:'',city:'',state:'',...address,[key]:e.target.value},product?.pickupPrices?.[method.id]??product?.price)}/></label>)}</div>}
 </div>;
}

/** Modalidades oferecidas pelo preço: mapa vazio = só pronta entrega pelo preço base. */
export function offeredPickupIds(methods:PickupMethod[],value:Record<string,number|null>={}){
 const keys=Object.keys(value);
 return methods.filter(m=>m.active&&(keys.length?Object.hasOwn(value,m.id)&&value[m.id]!==null:m.kind==='immediate')).map(m=>m.id);
}
const KIND_LABEL:Record<PickupMethod['kind'],string>={immediate:'Pronta entrega',order:'Encomenda',delivery:'Entrega'};

/**
 * Preço por tipo de retirada: todas as modalidades ativas da loja numa lista, cada uma com
 * "oferece" e o próprio preço (encomenda costuma sair mais em conta que pronta entrega).
 */
export function PickupPriceList({methods,value={},basePrice,disabled,onChange}:{methods:PickupMethod[];value?:Record<string,number|null>;basePrice:number;disabled?:boolean;onChange:(prices:Record<string,number|null>)=>void}){
 const active=methods.filter(m=>m.active);
 const offered=new Set(offeredPickupIds(active,value));
 // Mapa vazio vira explícito ao editar, para a pronta entrega não sumir quando outra modalidade é ligada.
 const materialize=()=>Object.keys(value).length?{...value}:Object.fromEntries(active.filter(m=>m.kind==='immediate').map(m=>[m.id,basePrice])) as Record<string,number|null>;
 function toggle(method:PickupMethod,on:boolean){
  const next=materialize();
  if(on) next[method.id]=value[method.id]??basePrice;
  else delete next[method.id];
  onChange(Object.keys(next).length?next:{[method.id]:null});
 }
 function setPrice(method:PickupMethod,price:number){const next=materialize();next[method.id]=price;onChange(next);}
 if(!active.length)return <p className="empty">Nenhuma modalidade de retirada ativa. Cadastre em Configurações › Tipos de retirada.</p>;
 return <div className="pickup-price-list">
  {active.map(method=>{const on=offered.has(method.id);return <div key={method.id} className={`pickup-price-list__row${on?' is-on':''}`}>
   <label className="pickup-price-list__toggle"><input type="checkbox" checked={on} disabled={disabled} onChange={e=>toggle(method,e.target.checked)}/><span><strong>{method.name}</strong><small>{KIND_LABEL[method.kind]}</small></span></label>
   <CurrencyInput ariaLabel={`Preço ${method.name}`} value={on?Number(value[method.id]??basePrice):0} disabled={disabled||!on} onChange={price=>setPrice(method,price)}/>
  </div>;})}
  <small className="pickup-price-list__hint">Marque onde o produto pode ser vendido e o preço de cada forma. Sem marcar nada, vale só a pronta entrega pelo preço base.</small>
 </div>;
}

/** Preço por retirada no nível do produto (sem variações). */
export function ProductPickupPrices({value={},basePrice,disabled,onChange}:{value?:Record<string,number|null>;basePrice:number;disabled:boolean;onChange:(prices:Record<string,number|null>)=>void}){
 const {methods,error}=usePickupMethods();
 return <div className="pickup-fields span-2"><p className="pickup-price-list__title">Preço por tipo de retirada</p><PickupPriceList methods={methods} value={value} basePrice={basePrice} disabled={disabled} onChange={onChange}/>{error&&<p role="alert">{error}</p>}</div>;
}

