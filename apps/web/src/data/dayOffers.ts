import {nestGet} from '../services/nestClient';
export type DayOffer={id:string;name:string;promoPrice:number;endDate:string;startDate?:string;criteria:{stockIds:string[];attributes?:Record<string,string>};channels:('totem'|'pdv'|'external')[]};
export const loadTotemOffers=()=>nestGet<DayOffer[]>('/totem/offers');
export function dayOfferFor(offers:DayOffer[],stockId:string,attrs:Record<string,string>,base:number,now=Date.now()){
 return offers.filter(offer=>Date.parse(offer.endDate)>now&&(!offer.startDate||Date.parse(offer.startDate)<=now)&&offer.criteria.stockIds.includes(stockId)&&Object.entries(offer.criteria.attributes??{}).every(([id,value])=>attrs[id]===value)&&offer.promoPrice>0&&offer.promoPrice<base).sort((a,b)=>a.promoPrice-b.promoPrice)[0]??null;
}
