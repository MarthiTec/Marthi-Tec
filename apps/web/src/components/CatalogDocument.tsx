import { useMemo, useState, type CSSProperties } from 'react';
import { colorHex, isLightColor } from '../data/catalogColors';
import { CatalogSelect } from './CatalogSelect';
import './catalogDocument.css';

export type CatalogAvailability = 'in_stock' | 'order' | 'sold_out';
export type CatalogVariant = {
  label: string;
  color: string;
  capacity: string;
  others: string[];
  condition: string;
  batteries: number[];
  price: number;
  available: number;
  availability: CatalogAvailability;
  leadDays: number | null;
  attributes: Array<{ id: string; name: string; value: string }>;
};
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
  orderOnly: boolean;
  videoUrl: string;
  specs: Array<{ label: string; value: string }>;
};
export type CatalogStore = { name: string; logo: string | null; phone: string; instagram: string; website: string };
export type CatalogLook = {
  title: string;
  subtitle: string;
  showCover: boolean;
  coverStyle: CoverStyle;
  /** catalog = catálogo digital (vitrine, "Tenho interesse" no WhatsApp); sales = página de venda (sacola e pedido). */
  mode?: 'catalog' | 'sales';
  coverImage: string;
  accent: string;
  showPrices: boolean;
  note: string;
  /** Produtos da faixa "Destaques" no topo. */
  featuredIds?: string[];
};
export type CoverStyle = 'hero' | 'minimal' | 'mosaic' | 'dark' | 'diagonal' | 'band';
/** Capas novas: faixa larga na tela (os produtos aparecem logo) e página inteira no PDF. */
const MODERN_COVERS: CoverStyle[] = ['hero', 'minimal', 'mosaic', 'dark'];

/** Pedido pelo catálogo (só no link do cliente). */
export type CatalogShop = {
  /** Página de venda: sacola e pedido. No catálogo digital, o cliente fala com a loja pelo WhatsApp. */
  canBuy: boolean;
  onAdd: (item: CatalogItem, variant: CatalogVariant | null) => void;
  onOpen: (item: CatalogItem) => void;
  onUpgrade: () => void;
  onSignup: () => void;
  onPdf: () => void;
};

export const catalogMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: value % 1 ? 2 : 0 });
const money = catalogMoney;
const monthYear = () => {
  const text = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
export const availabilityText = (variant: Pick<CatalogVariant, 'availability' | 'leadDays'>) =>
  variant.availability === 'order' ? `Sob encomenda${variant.leadDays ? ` · até ${variant.leadDays} ${variant.leadDays === 1 ? 'dia' : 'dias'}` : ''}` : variant.availability === 'sold_out' ? 'Esgotado' : 'Pronta entrega';

/** Link do WhatsApp da loja com a mensagem do produto (só quando a loja tem telefone). */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  const full = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

/** O que o cliente adianta sobre o aparelho da troca (a mesma lista da última página e do formulário). */
export const UPGRADE_CHECKLIST = [
  'Modelo, capacidade e cor do aparelho',
  'IMEI (disque *#06# ou veja em Ajustes › Geral › Sobre)',
  'Saúde da bateria (Ajustes › Bateria › Saúde)',
  'Estado: riscos, tela trincada ou trocada, se já foi aberto',
  'Face ID / Touch ID e câmeras funcionando',
  'Se tem caixa, carregador e nota fiscal',
];

type Filter = 'all' | 'new' | 'Novo' | 'used' | 'order';
type Sort = 'relevance' | 'price_asc' | 'price_desc' | 'new';

const openVariants = (item: CatalogItem) => item.variants.filter((v) => v.availability !== 'sold_out');
const uniq = (list: string[]) => [...new Set(list.filter(Boolean))];
/** Maior bateria entre os usados disponíveis do produto (para filtro e etiqueta "até X%"). */
const bestBattery = (item: CatalogItem) => Math.max(0, ...openVariants(item).flatMap((v) => v.batteries));

/** Foto do produto; sem foto (ou foto que não carrega) aparece o nome do produto no lugar. */
function ProductImage({ item }: { item: CatalogItem }) {
  const [failed, setFailed] = useState(false);
  return item.image && !failed ? (
    <img src={item.image} alt={item.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  ) : (
    <span className="catalog-card__noimg" aria-hidden>
      {item.name}
    </span>
  );
}

/** Bolinhas das cores disponíveis (até 6 e "+N"). */
function ColorDots({ colors }: { colors: string[] }) {
  if (!colors.length) return null;
  const shown = colors.slice(0, 6);
  return (
    <span className="catalog-dots" aria-label={`Cores: ${colors.join(', ')}`}>
      {shown.map((name) => {
        const hex = colorHex(name);
        return hex ? (
          <span key={name} className={`catalog-dot${isLightColor(hex) ? ' is-light' : ''}`} style={{ background: hex }} title={name} />
        ) : (
          <span key={name} className="catalog-tag" title={name}>
            {name}
          </span>
        );
      })}
      {colors.length > shown.length ? <span className="catalog-dots__more">+{colors.length - shown.length}</span> : null}
    </span>
  );
}

/**
 * Catálogo / página de venda: capa (opcional), destaques, busca e filtros (ordem, marca, bateria),
 * os produtos (foto ou nome, cores em bolinhas, capacidades, bateria, preço) e, no fim, o "Upgrade".
 * Tocar no produto abre a página dele (cores, capacidade, vídeo, ficha técnica, sacola fixa).
 * No PDF cada produto sai com a lista completa de opções.
 */
export function CatalogDocument({
  look,
  store,
  items,
  interactive = true,
  shop,
  initialQuery = '',
  initialBrand = '',
  initialFilter = 'all',
}: {
  look: CatalogLook;
  store: CatalogStore;
  items: CatalogItem[];
  /** Abrir já com busca / marca / filtro (atalhos da página inicial do link). */
  initialQuery?: string;
  initialBrand?: string;
  initialFilter?: 'all' | 'new' | 'order';
  /** Busca, filtros e "Tenho interesse"; na prévia do painel também funcionam. */
  interactive?: boolean;
  /** Pedido pelo próprio catálogo (link do cliente). */
  shop?: CatalogShop;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [sort, setSort] = useState<Sort>('relevance');
  const [brand, setBrand] = useState(initialBrand);
  const [minBattery, setMinBattery] = useState(0);
  const style = { '--cat-accent': look.accent || '#e4572e' } as CSSProperties;
  // 'none' = capa sem foto; vazio = a foto do primeiro produto com foto.
  const coverImage = look.coverImage === 'none' ? '' : look.coverImage || items.find((item) => item.image)?.image || '';
  // Mosaico: a foto escolhida primeiro e as dos outros produtos (até 4, sem repetir).
  const mosaic = [...new Set([coverImage, ...items.map((item) => item.image)].filter(Boolean) as string[])].slice(0, 4);
  const hasUsed = items.some((item) => item.variants.some((variant) => variant.condition !== 'Novo') || (item.condition && item.condition !== 'Novo'));
  const hasNew = items.some((item) => item.isNew);
  const hasOrder = items.some((item) => item.orderOnly || item.variants.some((variant) => variant.availability === 'order'));
  const hasBattery = items.some((item) => bestBattery(item) > 0);
  const brands = uniq(items.map((item) => item.brand)).sort();
  const featured = (look.featuredIds ?? []).map((id) => items.find((item) => item.id === id)).filter((item): item is CatalogItem => Boolean(item && !item.soldOut));

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = items.filter((item) => {
      if (term && !`${item.name} ${item.brand} ${item.variants.map((v) => v.label).join(' ')}`.toLowerCase().includes(term)) return false;
      if (brand && item.brand !== brand) return false;
      if (minBattery && bestBattery(item) < minBattery) return false;
      if (filter === 'new') return item.isNew;
      if (filter === 'order') return item.orderOnly || item.variants.some((v) => v.availability === 'order');
      const conditions = item.variants.length ? item.variants.map((v) => v.condition) : [item.condition || 'Novo'];
      if (filter === 'Novo') return conditions.includes('Novo');
      if (filter === 'used') return conditions.some((condition) => condition !== 'Novo');
      return true;
    });
    if (sort === 'price_asc') return [...list].sort((a, b) => a.price - b.price);
    if (sort === 'price_desc') return [...list].sort((a, b) => b.price - a.price);
    if (sort === 'new') return [...list].sort((a, b) => Number(b.isNew) - Number(a.isNew));
    return list;
  }, [items, query, filter, sort, brand, minBattery]);

  return (
    <div className="catalog" style={style}>
      {look.showCover && MODERN_COVERS.includes(look.coverStyle) ? (
        <section className={`catalog-cover catalog-cover--modern catalog-cover--${look.coverStyle}`} aria-label="Capa do catálogo">
          <div className="catalog-cover__copy">
            <span className="catalog-cover__store">
              {store.logo ? <img src={store.logo} alt="" /> : null}
              <strong>{store.name}</strong>
            </span>
            <h1>{look.title || 'Catálogo'}</h1>
            {look.subtitle ? <p>{look.subtitle}</p> : null}
            <small>
              {items.length} {items.length === 1 ? 'produto' : 'produtos'} · {monthYear()}
            </small>
          </div>
          {look.coverStyle === 'mosaic' && mosaic.length >= 2 ? (
            <div className={`catalog-cover__mosaic catalog-cover__mosaic--${Math.min(mosaic.length, 4)}`} aria-hidden>
              {mosaic.map((src) => (
                <span key={src}>
                  <img src={src} alt="" referrerPolicy="no-referrer" />
                </span>
              ))}
            </div>
          ) : coverImage ? (
            <div className="catalog-cover__art" aria-hidden>
              <img src={coverImage} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : null}
        </section>
      ) : look.showCover ? (
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
          {coverImage ? (
            <div className="catalog-cover__stage">
              <img className="catalog-cover__photo" src={coverImage} alt="" referrerPolicy="no-referrer" />
            </div>
          ) : null}
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
          {shop ? (
            <div className="catalog-head__actions">
              <button type="button" onClick={shop.onPdf} title="Baixar ou imprimir em PDF">
                PDF
              </button>
              <button type="button" onClick={shop.onSignup}>
                Meu cadastro
              </button>
            </div>
          ) : null}
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
                  ...(hasOrder ? [['order', 'Sob encomenda']] : []),
                ] as Array<[Filter, string]>
              ).map(([value, label]) => (
                <button key={value} type="button" className={filter === value ? 'is-on' : ''} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="catalog-filters">
              <CatalogSelect
                label="Ordenar"
                value={sort}
                onChange={(value) => setSort(value as Sort)}
                options={[
                  { value: 'relevance', label: 'Relevância' },
                  { value: 'price_asc', label: 'Menor preço' },
                  { value: 'price_desc', label: 'Maior preço' },
                  { value: 'new', label: 'Novidades' },
                ]}
              />
              {brands.length > 1 ? (
                <CatalogSelect label="Marca" value={brand} onChange={setBrand} options={[{ value: '', label: 'Todas' }, ...brands.map((name) => ({ value: name, label: name.charAt(0).toUpperCase() + name.slice(1) }))]} />
              ) : null}
              {hasBattery ? (
                <CatalogSelect
                  label="Bateria"
                  value={String(minBattery)}
                  onChange={(value) => setMinBattery(Number(value))}
                  options={[
                    { value: '0', label: 'Qualquer' },
                    { value: '80', label: 'Acima de 80%' },
                    { value: '85', label: 'Acima de 85%' },
                    { value: '90', label: 'Acima de 90%' },
                    { value: '95', label: 'Acima de 95%' },
                  ]}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {featured.length && interactive ? (
        <section className="catalog-featured" aria-label="Destaques">
          <h2>Destaques</h2>
          <ul>
            {featured.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => shop?.onOpen(item)} disabled={!shop}>
                  <span className="catalog-featured__media">
                    <ProductImage item={item} />
                  </span>
                  <strong>{item.name}</strong>
                  {look.showPrices && item.price > 0 ? (
                    <span className="catalog-featured__price">
                      {item.priceFrom ? <small>a partir de </small> : null}
                      {money(item.price)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visible.length ? (
        <ul className="catalog-grid">
          {visible.map((item) => {
            const interest = whatsappLink(store.phone, `Olá! Vi o catálogo da ${store.name || 'loja'} e tenho interesse no ${item.name}.`);
            const open = openVariants(item);
            const colors = uniq(open.map((v) => v.color));
            const capacities = uniq(open.map((v) => v.capacity));
            const battery = bestBattery(item);
            const single = item.variants.length <= 1;
            const lead = item.orderOnly ? open.find((v) => v.leadDays) : null;
            return (
              <li key={item.id} className={`catalog-card${item.soldOut ? ' is-sold-out' : ''}`}>
                <div
                  className={`catalog-card__media${shop ? ' is-link' : ''}`}
                  role={shop ? 'button' : undefined}
                  tabIndex={shop ? 0 : undefined}
                  aria-label={shop ? `Ver ${item.name}` : undefined}
                  onClick={() => shop?.onOpen(item)}
                  onKeyDown={(e) => (e.key === 'Enter' ? shop?.onOpen(item) : undefined)}
                >
                  <ProductImage item={item} />
                  <span className="catalog-card__badges">
                    {item.isNew ? <span className="catalog-badge catalog-badge--new">Novidade</span> : null}
                    {item.condition && item.condition !== 'Novo' ? <span className="catalog-badge">{item.condition}</span> : null}
                    {item.orderOnly ? <span className="catalog-badge catalog-badge--order">Sob encomenda</span> : null}
                    {item.soldOut ? <span className="catalog-badge catalog-badge--out">Esgotado</span> : null}
                  </span>
                </div>
                <div className="catalog-card__body">
                  {item.brand ? <span className="catalog-card__brand">{item.brand}</span> : null}
                  <h2 className={shop ? 'is-link' : ''} onClick={() => shop?.onOpen(item)}>
                    {item.name}
                  </h2>
                  {/* Tela: resumo (cores em bolinhas, capacidades, bateria). PDF: lista completa abaixo. */}
                  <div className="catalog-card__summary">
                    <ColorDots colors={colors} />
                    {capacities.length ? (
                      <span className="catalog-variants__tags">
                        {capacities.map((cap) => (
                          <span key={cap} className="catalog-tag catalog-tag--cap">
                            {cap}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {battery ? <span className="catalog-tag catalog-tag--battery">🔋 até {battery}%</span> : null}
                  </div>
                  {item.variants.length ? (
                    <ul className="catalog-variants catalog-variants--print">
                      {item.variants.map((variant, index) => (
                        <li key={index} className={variant.availability === 'sold_out' ? 'is-out' : ''}>
                          <span className="catalog-variants__tags">
                            {variant.color ? <span className="catalog-tag">{variant.color}</span> : null}
                            {variant.capacity ? <span className="catalog-tag catalog-tag--cap">{variant.capacity}</span> : null}
                            {variant.others.map((other) => (
                              <span key={other} className="catalog-tag">
                                {other}
                              </span>
                            ))}
                            {!item.condition || item.condition !== variant.condition ? <span className="catalog-tag catalog-tag--cond">{variant.condition}</span> : null}
                            {variant.batteries.length ? <span className="catalog-tag catalog-tag--battery">🔋 {variant.batteries.map((value) => `${value}%`).join(' · ')}</span> : null}
                            {variant.availability === 'order' && !item.orderOnly ? <span className="catalog-tag catalog-tag--order">{availabilityText(variant)}</span> : null}
                          </span>
                          {look.showPrices && variant.price > 0 && item.variants.length > 1 ? <strong>{money(variant.price)}</strong> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {lead ? <small className="catalog-card__lead">{availabilityText(lead)}</small> : null}
                  <div className="catalog-card__foot">
                    {look.showPrices && item.price > 0 ? (
                      <div className="catalog-price">
                        {item.priceFrom ? <small>a partir de</small> : null}
                        <strong>{money(item.price)}</strong>
                      </div>
                    ) : (
                      <span className="catalog-price catalog-price--ask">Consulte o preço</span>
                    )}
                    {shop?.canBuy && !item.soldOut ? (
                      <button type="button" className="catalog-buy" onClick={() => (single ? shop.onAdd(item, item.variants[0] ?? null) : shop.onOpen(item))}>
                        {single ? 'Adicionar à sacola' : 'Ver opções'}
                      </button>
                    ) : null}
                    {(interactive || shop) && interest && !item.soldOut && !shop?.canBuy ? (
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

      {/* Última página: o que adiantar do aparelho para dar na troca (Upgrade). */}
      <section className="catalog-upgrade" aria-label="Faça seu Upgrade">
        <span className="catalog-upgrade__kicker">Upgrade</span>
        <h2>Quer dar seu aparelho na troca?</h2>
        <p>Adiante estes dados e a avaliação fica mais rápida:</p>
        <ul>
          {UPGRADE_CHECKLIST.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {shop ? (
          <button type="button" className="catalog-buy" onClick={shop.onUpgrade}>
            Adiantar meus dados agora
          </button>
        ) : (
          <p className="catalog-upgrade__hint">Envie pelo WhatsApp{store.phone ? ` ${store.phone}` : ''} ou preencha pelo link do catálogo.</p>
        )}
      </section>

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
