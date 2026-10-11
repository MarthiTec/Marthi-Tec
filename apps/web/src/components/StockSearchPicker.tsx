import { useMemo, useRef, useState } from 'react';
import type { StockVariationRow, SupplierEntry } from '../data/adminStore';
import { entryImeis, stockMatches, type StockSearchable } from '../data/stockSearch';
import './stockSearchPicker.css';

export type SearchableProduct = StockSearchable & { id: string; name: string; price?: number; qty?: number };
/** O que o usuário escolheu: o produto e, quando a busca foi pelo IMEI, a variação e o IMEI do aparelho. */
export type StockPick<T> = { product: T; variation?: StockVariationRow; imei?: string };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clean = (value: string) => value.replace(/\s+/g, '').toLowerCase();

/** Aparelho em estoque com este IMEI exato (nas entradas do produto ou das variações). */
function findByImei<T extends SearchableProduct>(items: T[], query: string): StockPick<T> | null {
  const needle = clean(query);
  if (needle.length < 6) return null;
  const has = (entries: SupplierEntry[] | undefined) => (entries ?? []).some((entry) => entryImeis(entry).some((imei) => clean(imei) === needle));
  for (const product of items) {
    const variation = (product.variations ?? []).find((v) => clean(v.imei ?? '') === needle || has(v.supplierEntries));
    if (variation) return { product, variation, imei: query.trim() };
    if (clean(product.imei ?? '') === needle || has(product.supplierEntries)) return { product, imei: query.trim() };
  }
  return null;
}

/**
 * Busca do produto digitando: descrição, IMEI, SKU, modelo, marca ou fornecedor. Achando pelo IMEI,
 * já vem a variação do aparelho. Sem resultado, oferece cadastrar na hora para não travar a venda.
 */
export function StockSearchPicker<T extends SearchableProduct>({
  label,
  items,
  selected,
  onSelect,
  onClear,
  onNotFound,
  describe,
  disabled,
}: {
  label: string;
  items: T[];
  selected: T | null;
  onSelect: (pick: StockPick<T>) => void;
  onClear: () => void;
  onNotFound?: (query: string) => void;
  /** Linha de detalhe do resultado (variações, preço, estoque). */
  describe?: (item: T) => string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const imeiHit = useMemo(() => (query.trim() ? findByImei(items, query) : null), [items, query]);
  const results = useMemo(() => (query.trim() ? items.filter((item) => stockMatches(item, query)).slice(0, 12) : []), [items, query]);

  function pick(choice: StockPick<T>) {
    onSelect(choice);
    setQuery('');
    setOpen(false);
  }

  if (selected && !open) {
    return (
      <div className="stock-search-picker">
        <span className="stock-search-picker__label">{label}</span>
        <div className="stock-search-picker__selected">
          <span>
            <strong>{selected.name}</strong>
            {describe ? <small>{describe(selected)}</small> : null}
          </span>
          {!disabled ? (
            <button
              type="button"
              className="stock-search-picker__change"
              onClick={() => {
                setOpen(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              Trocar
            </button>
          ) : null}
          {!disabled ? (
            <button type="button" className="stock-search-picker__clear" aria-label="Tirar o produto da linha" onClick={onClear}>
              ×
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="stock-search-picker">
      <label className="stock-search-picker__label" htmlFor={undefined}>
        {label}
      </label>
      <input
        ref={inputRef}
        value={query}
        disabled={disabled}
        placeholder="Digite a descrição, IMEI ou SKU…"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (imeiHit) pick(imeiHit);
            else if (results.length === 1) pick({ product: results[0] });
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query.trim() ? (
        <ul className="stock-search-picker__results" role="listbox">
          {imeiHit ? (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(imeiHit)}>
                <span>
                  <strong>{imeiHit.product.name}</strong>
                  <small>
                    IMEI {imeiHit.imei}
                    {imeiHit.variation ? ` · ${Object.values(imeiHit.variation.attrs ?? {}).filter(Boolean).join(' · ')}` : ''}
                  </small>
                </span>
                <em>IMEI</em>
              </button>
            </li>
          ) : null}
          {results
            .filter((item) => !imeiHit || item.id !== imeiHit.product.id)
            .map((item) => (
              <li key={item.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick({ product: item })}>
                  <span>
                    <strong>{item.name}</strong>
                    {describe ? <small>{describe(item)}</small> : null}
                  </span>
                  <em>{item.price != null ? money(Number(item.price) || 0) : ''}</em>
                </button>
              </li>
            ))}
          {!imeiHit && !results.length ? (
            <li className="stock-search-picker__empty">
              <span>Nenhum produto com “{query.trim()}”.</span>
              {onNotFound ? (
                <button type="button" className="btn btn--primary btn--sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(false); onNotFound(query.trim()); setQuery(''); }}>
                  Cadastrar e vender
                </button>
              ) : null}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
