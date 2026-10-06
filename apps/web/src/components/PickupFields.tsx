import {useEffect,useState} from 'react';
import {nestRequest} from '../services/nestClient';
import {AdminPicker} from './AdminPicker';
import {usePickupMethods,type DeliveryAddress} from '../data/pickup';
export function PickupFields({product,methodId,address,onChange,publicMode=false}:{product?:{id?:string;pickupPrices?:Record<string,number|null>;price?:number;allowedPickupMethodIds?:string[]};methodId?:string;address?:DeliveryAddress;onChange:(methodId:string,address?:DeliveryAddress,price?:number)=>void;publicMode?:boolean}){
 const {methods,error}=usePickupMethods(publicMode);
 const prices=product?.pickupPrices??{};const available=methods.filter(m=>m.active&&(product?.allowedPickupMethodIds?product.allowedPickupMethodIds.includes(m.id):Object.keys(prices).length?Object.hasOwn(prices,m.id)&&prices[m.id]!==null:m.kind==='immediate'));const method=available.find(m=>m.id===methodId);
 const [estimatedDate,setEstimatedDate]=useState<string>();
 const [quoteError,setQuoteError]=useState('');
 useEffect(()=>{let alive=true;setEstimatedDate(undefined);setQuoteError('');if(method?.kind==='order'&&product?.id){void nestRequest<{estimatedDate:string}>(`${publicMode?'/totem/pickup-quote':'/pickup-quote'}?stockId=${encodeURIComponent(product.id)}&methodId=${encodeURIComponent(method.id)}`).then(q=>{if(alive)setEstimatedDate(q.estimatedDate);}).catch(e=>{if(alive)setQuoteError(e.message);});}return()=>{alive=false;};},[method?.id,product?.id,publicMode]);
 return <div className="pickup-fields"><AdminPicker label="Tipo de retirada" value={methodId||''} options={[{value:'',label:'Selecionar'},...available.map(m=>({value:m.id,label:m.name}))]} onChange={id=>onChange(id,undefined,product?.pickupPrices?.[id]??product?.price)}/>
 {(error||quoteError)&&<p role="alert">{error||quoteError}</p>}
 {method?.kind==='order'&&<p>Previsão de chegada: {estimatedDate ? new Date(estimatedDate+'T12:00:00').toLocaleDateString('pt-BR') : quoteError?'indisponível no momento':'consultando…'}. Você poderá acompanhar quando o aparelho estiver disponível para retirada.</p>}
 {method?.kind==='delivery'&&<div className="admin-form">{(['zipCode','street','number','district','city','state','complement'] as const).map((key,index)=><label key={key}>{['CEP','Rua','Número','Bairro','Cidade','UF','Complemento'][index]}<input required={key!=='complement'} value={address?.[key]||''} maxLength={key==='state'?2:120} onChange={e=>onChange(method.id,{zipCode:'',street:'',number:'',district:'',city:'',state:'',...address,[key]:e.target.value},product?.pickupPrices?.[method.id]??product?.price)}/></label>)}</div>}
 </div>;
}

export function ProductPickupPrices({value={},basePrice,disabled,onChange}:{value?:Record<string,number|null>;basePrice:number;disabled:boolean;onChange:(prices:Record<string,number|null>)=>void}){
 const {methods,error}=usePickupMethods();const [methodId,setMethodId]=useState('');return <div className="pickup-fields"><AdminPicker label="Tipo de retirada para definir preço" value={methodId} disabled={disabled} options={[{value:'',label:'Selecione a modalidade'},...methods.filter(m=>m.active).map(m=>({value:m.id,label:m.name}))]} onChange={setMethodId}/>{methodId&&<label>Preço da modalidade<input type="number" min={0} step="0.01" disabled={disabled} value={value[methodId]??basePrice} onChange={e=>onChange({...value,[methodId]:Number(e.target.value)})}/></label>}{error&&<p role="alert">{error}</p>}</div>;
}
