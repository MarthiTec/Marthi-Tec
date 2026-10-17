import { useMemo, useState, type CSSProperties } from 'react';
import './catalogDocument.css';

export type CatalogVariant = { label: string; color: string; capacity: string; others: string[]; condition: string; batteries: number[]; price: number; available: number };
export type CatalogItem = {
  id: string;
  name: string;
  brand: string;
  image: string | null;
  price: number;
  priceFrom: boolean;
  condition: string;
  variants: CatalogVariant[];
  isNew: boolean;
  soldOut: boolean;
};
export type CatalogStore = { name: string; logo: string | null; phone: string; instagram: string; website: string };
export type CatalogLook = {
  title: string;
  subtitle: string;
  showCover: boolean;
  coverStyle: 'diagonal' | 'band';
  coverImage: string;
  accent: string;
  showPrices: boolean;
  note: string;
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 });
const monthYear = () => {
  const text = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Link do WhatsApp da loja com a mensagem do produto (só quando a loja tem telefone). */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  const full = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

type Filter = 'all' | 'new' | 'Novo' | 'used';

/**
 * Catálogo para o cliente: capa (opcional) e os produtos com uma foto, o nome, o preço e cada variação
 * disponível (cor, capacidade, condição, bateria do usado). Mesmo desenho na prévia do painel, no link
 * do cliente e na impressão / PDF.
 */
export function CatalogDocument({
  look,
  store,
  items,
  interactive = true,
}: {
  look: CatalogLook;
  store: CatalogStore;
  items: CatalogItem[];
  /** Busca, filtros e "Tenho interesse" (o cliente); na prévia do painel também funcionam. */
  interactive?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const style = { '--cat-accent': look.accent || '#e4572e' } as CSSProperties;
  const coverImage = look.coverImage || items.find((item) => item.image)?.image || '';
  const hasUsed = items.some((item) => item.variants.some((variant) => variant.condition !== 'Novo') || (item.condition && item.condition !== 'Novo'));
  const hasNew = items.some((item) => item.isNew);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (term && !`${item.name} ${item.brand} ${item.variants.map((v) => v.label).join(' ')}`.toLowerCase().includes(term)) return false;
      if (filter === 'new') return item.isNew;
      const conditions = item.variants.length ? item.variants.map((v) => v.condition) : [item.condition || 'Novo'];
      if (filter === 'Novo') return conditions.includes('Novo');
      if (filter === 'used') return conditions.some((condition) => condition !== 'Novo');
      return true;
    });
  }, [items, query, filter]);

  return (
    <div className="catalog" style={style}>
      {look.showCover ? (
        <section className={`catalog-cover catalog-cover--${look.coverStyle}`} aria-label="Capa do catálogo">
          {look.coverStyle === 'diagonal' ? (
            <>
              <span className="catalog-cover__stripe catalog-cover__stripe--a" aria-hidden />
              <span className="catalog-cover__stripe catalog-cover__stripe--b" aria-hidden />
              <span className="catalog-cover__stripe catalog-cover__stripe--c" aria-hidden />
              <span className="catalog-cover__stripe catalog-cover__stripe--d" aria-hidden />
            </>
          ) : (
            <span className="catalog-cover__band" aria-hidden />
          )}
          <div className="catalog-cover__text">
            <h1>{look.title || 'Catálogo'}</h1>
            {look.subtitle ? <p>{look.subtitle}</p> : null}
          </div>
          {coverImage ? <img className="catalog-cover__photo" src={coverImage} alt="" referrerPolicy="no-referrer" /> : null}
          <div className="catalog-cover__brand">
            {store.logo ? <img src={store.logo} alt={store.name} /> : <strong>{store.name}</strong>}
            <small>{monthYear()}</small>
          </div>
        </section>
      ) : null}

      <header className="catalog-head">
        <div className="catalog-head__brand">
          {store.logo ? <img src={store.logo} alt="" /> : null}
          <div>
            <strong>{look.showCover ? store.name : look.title || store.name}</strong>
            <small>
              {items.length} {items.length === 1 ? 'produto' : 'produtos'}
              {!look.showCover && look.subtitle ? ` · ${look.subtitle}` : ''}
            </small>
          </div>
        </div>
        {interactive && items.length > 3 ? (
          <div className="catalog-head__tools">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar modelo, cor…" aria-label="Buscar no catálogo" />
            <div className="catalog-chips" role="group" aria-label="Filtrar">
              {(
                [
                  ['all', 'Todos'],
                  ...(hasNew ? [['new', 'Novidades']] : []),
                  ...(hasUsed ? [['Novo', 'Novos'], ['used', 'Seminovos']] : []),
                ] as Array<[Filter, string]>
              ).map(([value, label]) => (
                <button key={value} type="button" className={filter === value ? 'is-on' : ''} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      {visible.length ? (
        <ul className="catalog-grid">
          {visible.map((item) => {
            const interest = whatsappLink(store.phone, `Olá! Vi o catálogo da ${store.name || 'loja'} e tenho interesse no ${item.name}.`);
            return (
              <li key={item.id} className={`catalog-card${item.soldOut ? ' is-sold-out' : ''}`}>
                <div className="catalog-card__media">
                  {item.image ? (
                    <img src={item.image} alt={item.name} loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="catalog-card__noimg" aria-hidden>
                      {item.name}
                    </span>
                  )}
                  <span className="catalog-card__badges">
                    {item.isNew ? <span className="catalog-badge catalog-badge--new">Novidade</span> : null}
                    {item.condition && item.condition !== 'Novo' ? <span className="catalog-badge">{item.condition}</span> : null}
                    {item.soldOut ? <span className="catalog-badge catalog-badge--out">Esgotado</span> : null}
                  </span>
                </div>
                <div className="catalog-card__body">
                  {item.brand ? <span className="catalog-card__brand">{item.brand}</span> : null}
                  <h2>{item.name}</h2>
                  {item.variants.length ? (
                    <ul className="catalog-variants">
                      {item.variants.map((variant, index) => (
                        <li key={index} className={variant.available > 0 ? '' : 'is-out'}>
                          <span className="catalog-variants__tags">
                            {variant.color ? <span className="catalog-tag">{variant.color}</span> : null}
                            {variant.capacity ? <span className="catalog-tag catalog-tag--cap">{variant.capacity}</span> : null}
                            {variant.others.map((other) => (
                              <span key={other} className="catalog-tag">
                                {other}
                              </span>
                            ))}
                            {!item.condition || item.condition !== variant.condition ? <span className="catalog-tag catalog-tag--cond">{variant.condition}</span> : null}
                            {variant.batteries.length ? (
                              <span className="catalog-tag catalog-tag--battery" title="Saúde da bateria">
                                🔋 {variant.batteries.map((value) => `${value}%`).join(' · ')}
                              </span>
                            ) : null}
                          </span>
                          {look.showPrices && variant.price > 0 && item.variants.length > 1 ? <strong>{money(variant.price)}</strong> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="catalog-card__foot">
                    {look.showPrices && item.price > 0 ? (
                      <div className="catalog-price">
                        {item.priceFrom ? <small>a partir de</small> : null}
                        <strong>{money(item.price)}</strong>
                      </div>
                    ) : (
                      <span className="catalog-price catalog-price--ask">Consulte o preço</span>
                    )}
                    {interactive && interest && !item.soldOut ? (
                      <a className="catalog-cta" href={interest} target="_blank" rel="noreferrer">
                        Tenho interesse
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="catalog-empty">{items.length ? 'Nenhum produto com esse filtro.' : 'Nenhum produto disponível neste catálogo.'}</p>
      )}

      <footer className="catalog-foot">
        {look.note ? <p className="catalog-foot__note">{look.note}</p> : null}
        <p>
          <strong>{store.name}</strong>
          {store.phone ? ` · ${store.phone}` : ''}
          {store.instagram ? ` · @${store.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')}` : ''}
        </p>
        <small>Preços e disponibilidade sujeitos a alteração · {monthYear()}</small>
      </footer>
    </div>
  );
}
