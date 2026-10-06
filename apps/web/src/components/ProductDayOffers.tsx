import {useEffect,useState} from 'react';
import {AdminPicker} from './AdminPicker';
import {CrudRowActions} from './CrudKit';
import {hydratePromoCampaigns,listPromoCampaigns,upsertPromoCampaign,removePromoCampaign,type PromoCampaign} from '../data/promoCampaignStore';
import type {StockVariationRow} from '../data/adminStore';

const CHANNELS=[{id:'totem',label:'Totem'},{id:'pdv',label:'PDV'},{id:'external',label:'Venda externa'}] as const;
type Channel=typeof CHANNELS[number]['id'];
const brl=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function ProductDayOffers({stockId,name,variations,basePrice}:{stockId:string|null;name:string;variations:StockVariationRow[];basePrice:number}){
  const [offers,setOffers]=useState<PromoCampaign[]>([]);
  const [id,setId]=useState<string>();
  const [title,setTitle]=useState('Oferta do dia');
  const [price,setPrice]=useState('');
  const [end,setEnd]=useState('');
  const [index,setIndex]=useState('all');
  const [channels,setChannels]=useState<Channel[]>(['totem','pdv','external']);
  const [readonly,setReadonly]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  const reload=()=>setOffers(listPromoCampaigns().filter(offer=>offer.dayOffer&&offer.criteria.stockIds?.includes(stockId||'')));
  useEffect(()=>{let alive=true;void hydratePromoCampaigns().then(()=>{if(alive)reload();}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[stockId]);

  const selected=index==='all'?undefined:variations[Number(index)];
  const pricedVariations=selected?[selected]:variations;
  const candidatePrices=pricedVariations.flatMap(v=>[v.price,...Object.values(v.pickupPrices??{})].map(Number).filter(value=>value>0));
  const original=candidatePrices.length?Math.min(...candidatePrices):Number(basePrice)||0;
  const hasOriginal=Number.isFinite(original)&&original>0;

  function load(offer:PromoCampaign,view=false,copy=false){
    setId(copy?undefined:offer.id);setTitle(offer.name);setPrice(String(offer.promoPrice??''));
    setEnd(offer.endDate?new Date(new Date(offer.endDate).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):'');
    setChannels((offer.channels??[]) as Channel[]);
    const match=variations.findIndex(v=>Object.keys(v.attrs).length===Object.keys(offer.criteria.attributes??{}).length&&Object.entries(v.attrs).every(([key,value])=>offer.criteria.attributes?.[key]===value));
    setIndex(match>=0?String(match):'all');setReadonly(view);
  }

  function reset(){setId(undefined);setReadonly(false);setPrice('');setIndex('all');setError('');}

  async function save(){
    setError('');
    if(!stockId){setError('Salve o produto antes de cadastrar uma oferta.');return;}
    if(!hasOriginal){setError('Informe o preço do produto antes de criar a oferta.');return;}
    if(!Number.isFinite(Number(price))||Number(price)<=0||Number(price)>=original||!title.trim()||!end||new Date(end).getTime()<=Date.now()||!channels.length){setError('Escolha um preço positivo menor que o preço normal, validade futura e ao menos um canal.');return;}
    setBusy(true);
    try{
      await upsertPromoCampaign({id,name:title.trim(),active:true,dayOffer:true,channels,kind:'promo_price',criteria:{stockIds:[stockId],attributes:selected?.attrs??{}},stockIds:[stockId],promoPrice:Number(price),tiers:[],giftStockId:'',giftMinQty:1,priority:10,accumulative:false,note:'Oferta do dia · '+name,endDate:new Date(end).toISOString()});
      reload();setId(undefined);setPrice('');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a oferta.');}
    finally{setBusy(false);}
  }

  return <article className="admin-card stock-form-card day-offers">
    <div className="day-offers__head">
      <h3>Ofertas do dia</h3>
      <p className="empty">Defina um preço especial para este produto ou uma grade específica. A oferta termina automaticamente no horário informado.</p>
      {!stockId&&<p className="day-offers__notice">Salve o produto primeiro para vincular a oferta à loja correta.</p>}
    </div>
    <div className={`admin-form ${readonly?'is-readonly':''}`}>
      <label>Título<input value={title} disabled={readonly} onChange={e=>setTitle(e.target.value)}/></label>
      <AdminPicker label="Grade da oferta" value={index} disabled={readonly} options={[{value:'all',label:'Todas as grades'},...variations.map((v,i)=>({value:String(i),label:Object.values(v.attrs).join(' · ')||`Item #${i+1}`}))]} onChange={setIndex}/>
      <label>De (preço normal)<input value={hasOriginal?brl(original):'—'} readOnly tabIndex={-1}/></label>
      <label>Por (preço da oferta)<input type="number" min="0.01" step="0.01" placeholder="0,00" value={price} disabled={readonly} onChange={e=>setPrice(e.target.value)}/></label>
      <label>Oferta válida até<input type="datetime-local" value={end} disabled={readonly} onChange={e=>setEnd(e.target.value)}/></label>
      <fieldset className="day-offers__channels">
        <legend>Canais</legend>
        <div>
          {CHANNELS.map(channel=><label key={channel.id} className="day-offers__channel">
            <input type="checkbox" checked={channels.includes(channel.id)} disabled={readonly} onChange={e=>setChannels(current=>e.target.checked?[...current,channel.id]:current.filter(value=>value!==channel.id))}/>
            <span>{channel.label}</span>
          </label>)}
        </div>
      </fieldset>
    </div>
    {error&&<p role="alert" className="qty-low">{error}</p>}
    <div className="day-offers__actions">
      <button type="button" className="btn btn--primary" disabled={readonly||busy||!stockId} onClick={()=>void save()}>{busy?'Salvando…':id?'Salvar oferta':'Criar oferta'}</button>
      <button type="button" className="btn btn--ghost" onClick={reset}>Nova oferta</button>
    </div>
    {offers.length>0&&<div className="admin-table-container">
      <table className="admin-table">
        <thead><tr><th>Oferta</th><th>Preço</th><th>Validade</th><th className="admin-table__actions" style={{textAlign:'center',width:'130px'}}>Ações</th></tr></thead>
        <tbody>{offers.map(offer=><tr key={offer.id}>
          <td>{offer.name}</td>
          <td>{brl(Number(offer.promoPrice))}</td>
          <td>{offer.endDate?new Date(offer.endDate).toLocaleString('pt-BR'):'—'}</td>
          <td className="admin-table__actions"><CrudRowActions onView={()=>load(offer,true)} onEdit={()=>load(offer)} onDuplicate={()=>load(offer,false,true)} onDelete={()=>{if(window.confirm('Excluir esta oferta?'))void removePromoCampaign(offer.id).then(reload).catch(e=>setError(e.message));}}/></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </article>;
}
