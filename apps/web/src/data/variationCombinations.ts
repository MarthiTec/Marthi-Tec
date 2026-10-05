export function buildVariationCombinations(attributes: {id:string;values:string[]}[]) {
 let rows: Record<string,string>[]=[{}];
 for(const attribute of attributes) {
  const values=[...new Set(attribute.values.filter(Boolean))];
  if(!values.length) throw new Error('Cadastre as opções dos atributos antes de gerar as variações.');
  if(rows.length*values.length>500)throw new Error('A combinação excede 500 variações. Reduza as opções dos atributos.');
  rows=rows.flatMap(row=>values.map(value=>({...row,[attribute.id]:value})));
 }
 return attributes.length ? rows : [];
}
