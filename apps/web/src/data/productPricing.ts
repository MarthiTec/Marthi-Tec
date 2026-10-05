export type PricingPolicy={basis:'markup'|'margin';percent:number};
export function priceMetrics(cost:number,price:number){
 return {markup:cost>0?(price/cost-1)*100:null,margin:cost>0&&price>0?(1-cost/price)*100:null,factor:cost>0?price/cost:null};
}
export function suggestedPrice(cost:number,policy?:PricingPolicy|null){
 if(!policy||!Number.isFinite(cost)||cost<=0||!Number.isFinite(policy.percent)||policy.percent<0||policy.basis==='margin'&&policy.percent>=100)return null;
 const value=policy.basis==='margin'?cost/(1-policy.percent/100):cost*(1+policy.percent/100);
 return Number.isFinite(value)?Math.round(value*100)/100:null;
}
