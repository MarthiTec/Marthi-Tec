import type { StockItem, SupplierEntry } from './adminStore';

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Só o que a busca lê: serve para o StockItem completo e para as listas enxutas (venda externa). */
export type StockSearchable = Partial<Omit<StockItem, 'attrs'>> & { attrs?: Record<string, unknown> };

/**
 * Texto de busca do produto: descrição, marca, tipo, modelo, SKU, códigos, atributos da grade,
 * IMEIs (do produto, das variações e das entradas) e fornecedores/clientes das entradas.
 */
export function stockSearchText(item: StockSearchable, supplierNames?: Map<string, string>) {
  const entries: SupplierEntry[] = [...(item.supplierEntries ?? []), ...(item.variations ?? []).flatMap((v) => v.supplierEntries ?? [])];
  const parts = [
    item.name,
    item.brand,
    item.catalogTypeName,
    item.catalogModelName,
    item.sku,
    item.barcode,
    item.imei,
    item.supplierId ? supplierNames?.get(item.supplierId) : '',
    ...Object.values(item.attrs ?? {}),
    ...(item.variations ?? []).flatMap((v) => [v.imei, v.barcode, ...Object.values(v.attrs ?? {})]),
    ...entries.flatMap((entry) => [
      ...(entry.imeis ?? []),
      entry.supplierName,
      entry.supplierId ? supplierNames?.get(entry.supplierId) : '',
      entry.customerName,
    ]),
  ];
  return fold(parts.filter((part) => typeof part === 'string' && part).join(' '));
}

/** Todos os termos da busca aparecem no produto (ordem livre: "15 pro max azul"). */
export function stockMatches(item: StockSearchable, query: string, supplierNames?: Map<string, string>) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = stockSearchText(item, supplierNames);
  return terms.every((term) => text.includes(term));
}
