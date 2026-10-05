import {useEffect,useId,useRef,useState} from 'react';
import {AdminPicker} from './AdminPicker';
import {priceMetrics,suggestedPrice,type PricingPolicy} from '../data/productPricing';
import type {StockItem} from '../data/adminStore';
import {Link} from 'react-router-dom';
const decimal=(value:number)=>value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function ProductPriceMetrics({cost,price}:{cost:number;price:number}){
 const m=priceMetrics(cost,price);return <div className="product-price-metrics"><span>Margem bruta: <strong>{m.margin===null?'—':decimal(m.margin)+'%'}</strong></span><span>Markup: <strong>{m.markup===null?'—':decimal(m.markup)+'%'}</strong>{m.factor!==null&&' ('+decimal(m.factor)+'×)'}</span></div>;
}
export function ProductPriceSuggestion({cost,price=0,policy,disabled,onChange,onApply,compact=false,itemLabel='Produto'}:{cost:number;price?:number;policy?:PricingPolicy|null;compact?:boolean;itemLabel?:string;disabled:boolean;onChange:(policy:PricingPolicy|null)=>void;onApply:(price:number)=>void}){
 policy=policy&&(policy.basis==='markup'||policy.basis==='margin')&&Number.isFinite(policy.percent)?policy:null;
 const [open,setOpen]=useState(false);
 const [draft,setDraft]=useState<PricingPolicy|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
 const suggestion=suggestedPrice(cost,policy);
 const draftSuggestion=suggestedPrice(cost,draft);
 const close=()=>{dialog.current?.close();setOpen(false);};
 return <>
  <button type="button" className={compact?'product-price-summary product-price-summary--compact':'product-price-summary'} disabled={disabled} aria-label={'Ajustar preço de '+itemLabel} onClick={()=>{setDraft(policy?{...policy}:null);setOpen(true);}}>
   <span>{suggestion===null?'Definir sugestão':money(suggestion)}</span>
   <small>{policy?(policy.basis==='margin'?'Margem':'Markup')+' desejado: '+decimal(policy.percent)+'%':'Informe custo e percentual'}</small>
   {!disabled&&<small className="product-price-summary__action">Ajustar preço</small>}
  </button>
  {open&&<dialog ref={dialog} className="product-pricing-dialog" aria-labelledby={titleId} onCancel={close} onClose={()=>setOpen(false)}>
   <div className="product-price-suggestion">
    <h2 id={titleId}>Margem e sugestão de preço</h2>
    <p className="product-pricing-dialog__item">{itemLabel}</p>
    <div className="product-pricing-dialog__values"><span>Custo: <strong>{money(cost)}</strong></span><span>Venda atual: <strong>{money(price)}</strong></span></div>
    <ProductPriceMetrics cost={cost} price={price}/>
    <AdminPicker label="Calcular sugestão por" value={draft?.basis??'markup'} disabled={disabled} options={[{value:'markup',label:'Markup sobre o custo'},{value:'margin',label:'Margem bruta desejada'}]} onChange={basis=>setDraft({basis:basis as PricingPolicy['basis'],percent:draft?.percent??0})}/>
    <label>{draft?.basis==='margin'?'Margem desejada (%)':'Markup desejado (%)'}<input autoFocus type="number" min={0} max={draft?.basis==='margin'?99.99:undefined} step="0.01" placeholder="Informe o percentual" value={draft?.percent??''} disabled={disabled} onChange={e=>setDraft(e.target.value===''?null:{basis:draft?.basis??'markup',percent:Number(e.target.value)})}/></label>
    <span>{draftSuggestion===null?'Informe custo e um percentual válido para sugerir.':'Preço sugerido: '+money(draftSuggestion)}</span>
    {draftSuggestion!==null&&<ProductPriceMetrics cost={cost} price={draftSuggestion}/>}
    <div className="product-pricing-dialog__actions">
     <button type="button" className="btn btn--ghost" onClick={close}>Cancelar</button>
     <button type="button" className="btn btn--ghost" disabled={disabled||(draft!==null&&draftSuggestion===null)} onClick={()=>{onChange(draft);close();}}>Salvar cálculo</button>
     <button type="button" className="btn btn--primary" disabled={disabled||draftSuggestion===null} onClick={()=>{if(draftSuggestion!==null){onChange(draft);onApply(draftSuggestion);close();}}}>Aplicar ao preço</button>
    </div>
   </div>
  </dialog>}
 </>;
}
export function LastStockEntry({entry}:{entry?:StockItem['lastEntry']}){
 if(!entry)return <span className="empty">Sem entrada registrada.</span>;
 const date=(value:string)=>new Date(value.length===10?value+'T12:00:00':value).toLocaleString('pt-BR',value.length===10?{dateStyle:'short'}:{dateStyle:'short',timeStyle:'short'});
 return <div className="product-last-entry"><strong>{date(entry.enteredAt)}</strong><span>{entry.qty} un. · custo {money(entry.unitCost)}</span>{entry.invoice?<><Link to={'/erp/notas?nota='+encodeURIComponent(entry.invoice.id)}>Nota {entry.invoice.number||'sem número'}{entry.invoice.series?' · série '+entry.invoice.series:''}</Link>{entry.invoice.issuedAt&&<span>Emissão: {date(entry.invoice.issuedAt)}</span>}{entry.invoice.movementAt&&<span>Entrada na nota: {date(entry.invoice.movementAt)}</span>}</>:<span>{entry.origin==='manual'?'Saldo inicial':entry.origin==='adjustment'?'Ajuste manual':entry.origin==='commercial_receipt'?'Recebimento de encomenda':entry.origin==='trade_in'?'Recebimento de aparelho na troca':'Entrada sem nota vinculada'}</span>}</div>;
}
