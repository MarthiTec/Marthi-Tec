/** Stable API representation for PostgreSQL numeric and snake_case fields. */
export function rowToClient(row:Record<string,unknown> | undefined):Record<string,unknown> {
 if(!row) throw Object.assign(new Error('Registro não encontrado nesta loja.'),{status:404});
 const numeric=new Set(['amount','paid_amount','received_amount','initial_balance','current_balance','interest_amount','fine_amount','discount_amount','commission_percent','percent']);
 return Object.fromEntries(Object.entries(row).map(([key,value])=>[
   key.replace(/_([a-z])/g,(_,letter:string)=>letter.toUpperCase()),
   numeric.has(key)&&value!==null ? Number(value) : value,
 ]));
}
