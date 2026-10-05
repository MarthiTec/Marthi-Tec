import {AdminPicker} from './AdminPicker';
import {priceMetrics,suggestedPrice,type PricingPolicy} from '../data/productPricing';
import type {StockItem} from '../data/adminStore';
import {Link} from 'react-router-dom';
const decimal=(value:number)=>value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function ProductPriceMetrics({cost,price}:{cost:number;price:number}){
 const m=priceMetrics(cost,price);return <div className="product-price-metrics"><span>Margem bruta: <strong>{m.margin===null?'—':decimal(m.margin)+'%'}</strong></span><span>Markup: <strong>{m.markup===null?'—':decimal(m.markup)+'%'}</strong>{m.factor!==null&&' ('+decimal(m.factor)+'×)'}</span></div>;
}
export function ProductPriceSuggestion({cost,policy,disabled,onChange,onApply,compact=false}:{cost:number;policy?:PricingPolicy|null;compact?:boolean;disabled:boolean;onChange:(policy:PricingPolicy|null)=>void;onApply:(price:number)=>void}){
 const suggestion=suggestedPrice(cost,policy);return <div className="product-price-suggestion"><AdminPicker compact={compact} label="Calcular sugestão por" value={policy?.basis??'markup'} disabled={disabled} options={[{value:'markup',label:'Markup sobre o custo'},{value:'margin',label:'Margem bruta desejada'}]} onChange={basis=>onChange({basis:basis as PricingPolicy['basis'],percent:policy?.percent??0})}/><label>{policy?.basis==='margin'?'Margem desejada (%)':'Markup desejado (%)'}<input type="number" min={0} max={policy?.basis==='margin'?99.99:undefined} step="0.01" placeholder="Informe o percentual" value={policy?.percent??''} disabled={disabled} onChange={e=>onChange(e.target.value===''?null:{basis:policy?.basis??'markup',percent:Number(e.target.value)})}/></label><span>{suggestion===null?'Informe custo e percentual para sugerir.':'Preço sugerido: '+money(suggestion)}</span><button type="button" className="btn btn--ghost btn--xs" disabled={disabled||suggestion===null} onClick={()=>{if(suggestion!==null)onApply(suggestion);}}>Aplicar sugestão</button></div>;
}
export function LastStockEntry({entry}:{entry?:StockItem['lastEntry']}){
 if(!entry)return <span className="empty">Sem entrada registrada.</span>;
 const date=(value:string)=>new Date(value.length===10?value+'T12:00:00':value).toLocaleString('pt-BR',value.length===10?{dateStyle:'short'}:{dateStyle:'short',timeStyle:'short'});
 return <div className="product-last-entry"><strong>{date(entry.enteredAt)}</strong><span>{entry.qty} un. · custo {money(entry.unitCost)}</span>{entry.invoice?<><Link to={'/erp/notas?nota='+encodeURIComponent(entry.invoice.id)}>Nota {entry.invoice.number||'sem número'}{entry.invoice.series?' · série '+entry.invoice.series:''}</Link>{entry.invoice.issuedAt&&<span>Emissão: {date(entry.invoice.issuedAt)}</span>}{entry.invoice.movementAt&&<span>Entrada na nota: {date(entry.invoice.movementAt)}</span>}</>:<span>{entry.origin==='manual'?'Saldo inicial':entry.origin==='adjustment'?'Ajuste manual':entry.origin==='commercial_receipt'?'Recebimento de encomenda':entry.origin==='trade_in'?'Recebimento de aparelho na troca':'Entrada sem nota vinculada'}</span>}</div>;
}
