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
/** IMEIs da entrada que ainda estão no estoque (os vendidos/baixados só entram quando pedido). */
export function entryImeis(entry: SupplierEntry, includeOut = false) {
  if (includeOut) return entry.imeis ?? [];
  const out = new Set((entry.soldImeis ?? []).map((item) => item.imei));
  return (entry.imeis ?? []).filter((imei) => !out.has(imei));
}

export function stockSearchText(item: StockSearchable, supplierNames?: Map<string, string>, options: { includeSoldImeis?: boolean } = {}) {
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
      ...entryImeis(entry, options.includeSoldImeis),
      entry.supplierName,
      entry.supplierId ? supplierNames?.get(entry.supplierId) : '',
      entry.customerName,
    ]),
  ];
  return fold(parts.filter((part) => typeof part === 'string' && part).join(' '));
}

/** Todos os termos da busca aparecem no produto (ordem livre: "15 pro max azul"). */
export function stockMatches(item: StockSearchable, query: string, supplierNames?: Map<string, string>, options: { includeSoldImeis?: boolean } = {}) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = stockSearchText(item, supplierNames, options);
  return terms.every((term) => text.includes(term));
}
