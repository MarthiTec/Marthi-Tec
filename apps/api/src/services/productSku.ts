export function productSku(product: {name:string;brand?:string;color?:string;capacity?:string;condition?:string;attrs?:Record<string,unknown>}) {
  const token=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,32);
  const values=[product.brand,product.name,...[product.color,product.capacity,...Object.values(product.attrs??{})].map(token).filter(Boolean).sort(),product.condition];
  return [...new Set(values.map(token).filter(Boolean))].join('-').slice(0,160)||'PRODUTO';
}
