import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { catalogMoney as money, whatsappLink, type CatalogItem, type CatalogLook, type CatalogStore } from './CatalogDocument';
import './catalogHome.css';

export type HomeShopIntent = { query?: string; brand?: string; filter?: 'all' | 'new' | 'order' };

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
};
const brandLabel = (brand: string) => brand.charAt(0).toUpperCase() + brand.slice(1);

/**
 * Página inicial do link do cliente: escolhe o que quer (ver o catálogo, pedir manutenção, acompanhar),
 * já vendo as novidades e os destaques da loja. Tudo vem do catálogo salvo (nada fixo).
 */
export function CatalogHome({
  look,
  store,
  items,
  hasRepairs,
  canBuy,
  onShop,
  onRepair,
  onTrack,
  onOpenItem,
  onSignup,
}: {
  look: CatalogLook;
  store: CatalogStore;
  items: CatalogItem[];
  hasRepairs: boolean;
  canBuy: boolean;
  onShop: (intent?: HomeShopIntent) => void;
  onRepair: () => void;
  onTrack: () => void;
  onOpenItem: (item: CatalogItem) => void;
  onSignup: () => void;
}) {
  const [query, setQuery] = useState('');
  const style = { '--cat-accent': look.accent || '#e4572e' } as CSSProperties;
  const available = items.filter((item) => !item.soldOut);
  const news = available.filter((item) => item.isNew);
  const featured = (look.featuredIds ?? []).map((id) => available.find((item) => item.id === id)).filter((item): item is CatalogItem => Boolean(item));
  // Sem novidade cadastrada nos últimos dias, a vitrine mostra os destaques (ou os primeiros produtos).
  const showcase = news.length ? news : featured.length ? featured : available.slice(0, 10);
  const brands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of available) if (item.brand) counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [available]);
  const minPrice = available.map((item) => item.price).filter((price) => price > 0);
  const from = minPrice.length && look.showPrices ? Math.min(...minPrice) : 0;
  const orderCount = available.filter((item) => item.orderOnly || item.variants.some((variant) => variant.availability === 'order')).length;
  const wa = whatsappLink(store.phone, `Olá! Vim pelo catálogo da ${store.name || 'loja'}.`);
  const firstName = store.name || 'nossa loja';

  return (
    <div className="chome" style={style}>
      <section className="chome__hero">
        <div className="chome__glow" aria-hidden />
        <div className="chome__brand">
          {store.logo ? <img src={store.logo} alt="" /> : <span className="chome__mono">{firstName.slice(0, 1)}</span>}
          <div>
            <small>{greeting()}! Bem-vindo à</small>
            <strong>{firstName}</strong>
          </div>
        </div>
        <h1>O que você procura hoje?</h1>
        <form
          className="chome__search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onShop({ query: query.trim() });
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar celular, modelo, cor…" aria-label="Buscar no catálogo" enterKeyHint="search" />
          <button type="submit" aria-label="Buscar">
            Buscar
          </button>
        </form>
      </section>

      <section className="chome__actions" aria-label="O que você quer fazer">
        <button type="button" className="chome__action chome__action--shop" onClick={() => onShop()}>
          <span className="chome__icon" aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M6 8h12l-1 12H7L6 8z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </svg>
          </span>
          <span className="chome__action-text">
            <strong>{canBuy ? 'Comprar produtos' : 'Ver o catálogo'}</strong>
            <small>
              {available.length} {available.length === 1 ? 'produto' : 'produtos'}
              {from ? ` · a partir de ${money(from)}` : ''}
            </small>
          </span>
          <span className="chome__go" aria-hidden>
            →
          </span>
        </button>
        {hasRepairs ? (
          <button type="button" className="chome__action chome__action--repair" onClick={onRepair}>
            <span className="chome__icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z" />
              </svg>
            </span>
            <span className="chome__action-text">
              <strong>Solicitar manutenção</strong>
              <small>Orçamento pelo celular, sem fila</small>
            </span>
            <span className="chome__go" aria-hidden>
              →
            </span>
          </button>
        ) : null}
        <div className="chome__mini">
          {hasRepairs ? (
            <button type="button" onClick={onTrack}>
              <span aria-hidden>📍</span> Acompanhar manutenção
            </button>
          ) : null}
          {orderCount ? (
            <button type="button" onClick={() => onShop({ filter: 'order' })}>
              <span aria-hidden>📦</span> Sob encomenda ({orderCount})
            </button>
          ) : null}
          <button type="button" onClick={onSignup}>
            <span aria-hidden>👤</span> Meu cadastro
          </button>
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer">
              <span aria-hidden>💬</span> WhatsApp
            </a>
          ) : null}
        </div>
      </section>

      {showcase.length ? (
        <Rail
          title={news.length ? 'Novidades' : featured.length ? 'Destaques' : 'Para você'}
          subtitle={news.length ? 'Chegaram nos últimos dias' : undefined}
          items={showcase}
          showPrices={look.showPrices}
          onOpen={onOpenItem}
          onMore={() => onShop(news.length ? { filter: 'new' } : undefined)}
          badge={news.length ? 'Novo' : undefined}
        />
      ) : null}

      {brands.length > 1 ? (
        <section className="chome__section">
          <header className="chome__section-head">
            <h2>Navegue por marca</h2>
          </header>
          <div className="chome__brands">
            {brands.map(([brand, count]) => (
              <button key={brand} type="button" onClick={() => onShop({ brand })}>
                <strong>{brandLabel(brand)}</strong>
                <small>{count}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {news.length && featured.length ? <Rail title="Destaques" items={featured} showPrices={look.showPrices} onOpen={onOpenItem} onMore={() => onShop()} /> : null}

      <footer className="chome__foot">
        <strong>{firstName}</strong>
        <span>
          {[store.phone, store.instagram ? `@${store.instagram.replace(/^@/, '')}` : '', store.website].filter(Boolean).join(' · ')}
        </span>
        {look.note ? <p>{look.note}</p> : null}
      </footer>
    </div>
  );
}

/** Vitrine horizontal (arrasta no celular; setas no computador). */
function Rail({
  title,
  subtitle,
  items,
  showPrices,
  onOpen,
  onMore,
  badge,
}: {
  title: string;
  subtitle?: string;
  items: CatalogItem[];
  showPrices: boolean;
  onOpen: (item: CatalogItem) => void;
  onMore: () => void;
  badge?: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const sync = () => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(() => {
    sync();
    const el = track.current;
    el?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      el?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [items.length]);
  const move = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <section className="chome__section">
      <header className="chome__section-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <span className="chome__arrows">
          <button type="button" aria-label="Anteriores" disabled={edge.start} onClick={() => move(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Próximos" disabled={edge.end} onClick={() => move(1)}>
            ›
          </button>
          <button type="button" className="chome__more" onClick={onMore}>
            Ver tudo
          </button>
        </span>
      </header>
      <ul className="chome__rail" ref={track}>
        {items.map((item, index) => (
          <li key={item.id} style={{ ['--i' as string]: Math.min(index, 8) }}>
            <button type="button" className="chome__card" onClick={() => onOpen(item)}>
              <span className="chome__card-media">
                {item.image ? <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="chome__card-name">{item.name}</span>}
                {badge ? <em>{badge}</em> : null}
              </span>
              <span className="chome__card-body">
                {item.brand ? <small>{brandLabel(item.brand)}</small> : null}
                <strong>{item.name}</strong>
                {showPrices && item.price > 0 ? (
                  <b>
                    {item.priceFrom ? <i>a partir de </i> : null}
                    {money(item.price)}
                  </b>
                ) : (
                  <b className="chome__ask">Consulte</b>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
