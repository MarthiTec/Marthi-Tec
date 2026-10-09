const token=(value:unknown)=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,32);

/** Nome do fornecedor no SKU: o nome escolhido pela loja, senão o nome fantasia, senão só o primeiro nome. */
export function supplierSkuName(supplier: {skuName?:string|null;tradeName?:string|null;name?:string|null}|null|undefined) {
  if(!supplier)return '';
  return token(supplier.skuName?.trim()||supplier.tradeName?.trim()||String(supplier.name??'').trim().split(/\s+/)[0]);
}

export function productSku(product: {name:string;brand?:string;supplier?:string;color?:string;capacity?:string;condition?:string;attrs?:Record<string,unknown>}) {
  const values=[product.brand,product.supplier,product.name,...[product.color,product.capacity,...Object.values(product.attrs??{})].map(token).filter(Boolean).sort(),product.condition];
  return [...new Set(values.map(token).filter(Boolean))].join('-').slice(0,160)||'PRODUTO';
}
