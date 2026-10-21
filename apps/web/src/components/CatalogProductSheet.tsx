import { useMemo, useState, type CSSProperties } from 'react';
import { availabilityText, catalogMoney as money, whatsappLink, type CatalogItem, type CatalogLook, type CatalogStore, type CatalogVariant } from './CatalogDocument';
import { videoEmbed } from './ProductSpecsPanel';
import { colorHex, isLightColor } from '../data/catalogColors';
import './catalogProductSheet.css';

const open = (variant: CatalogVariant) => variant.availability !== 'sold_out';
const unique = (list: string[]) => [...new Set(list.filter(Boolean))];

/**
 * Página do produto no catálogo / página de venda (como nos grandes sites): foto, capacidade em botões,
 * cor em bolinhas, condição, bateria, disponibilidade e preço da opção escolhida, vídeo e ficha técnica;
 * a barra "Adicionar à sacola" fica sempre fixa embaixo.
 */
export function CatalogProductSheet({
  item,
  look,
  store,
  onAdd,
  onClose,
  onRequest,
  canBuy: sells = true,
}: {
  item: CatalogItem;
  look: CatalogLook;
  store: CatalogStore;
  /** Página de venda (sacola). No catálogo digital o botão vira "Tenho interesse" no WhatsApp. */
  canBuy?: boolean;
  onAdd: (item: CatalogItem, variant: CatalogVariant | null) => void;
  onClose: () => void;
  /** Quando indisponível: abrir solicitação ao vendedor. */
  onRequest?: (item: CatalogItem, variant: CatalogVariant | null) => void;
}) {
  const variants = item.variants;
  const first = variants.find(open) ?? variants[0] ?? null;
  const [capacity, setCapacity] = useState(first?.capacity ?? '');
  const [color, setColor] = useState(first?.color ?? '');
  const [condition, setCondition] = useState(first?.condition ?? '');
  const [imageFailed, setImageFailed] = useState(false);
  const capacities = unique(variants.map((v) => v.capacity));
  const colors = unique(variants.map((v) => v.color));
  const conditions = unique(variants.map((v) => v.condition));

  const variant = useMemo(() => {
    if (!variants.length) return null;
    const exact = variants.find((v) => (!capacities.length || v.capacity === capacity) && (!colors.length || v.color === color) && (conditions.length < 2 || v.condition === condition));
    return exact ?? null;
  }, [variants, capacity, color, condition, capacities.length, colors.length, conditions.length]);

  /** Escolheu uma opção: mantém o que ainda combina e completa com a primeira disponível. */
  function choose(patch: { capacity?: string; color?: string; condition?: string }) {
    const want = { capacity, color, condition, ...patch };
    const fits = (v: CatalogVariant, keys: Array<keyof typeof want>) => keys.every((key) => !want[key] || v[key] === want[key]);
    const best =
      variants.find((v) => open(v) && fits(v, ['capacity', 'color', 'condition'])) ??
      variants.find((v) => open(v) && fits(v, Object.keys(patch) as Array<keyof typeof want>)) ??
      variants.find((v) => fits(v, Object.keys(patch) as Array<keyof typeof want>));
    setCapacity(best?.capacity ?? want.capacity);
    setColor(best?.color ?? want.color);
    setCondition(best?.condition ?? want.condition);
  }
  const available = (key: 'capacity' | 'color' | 'condition', value: string) => variants.some((v) => v[key] === value && open(v));

  const price = variant ? variant.price : item.price;
  const canBuy = variants.length ? Boolean(variant && open(variant)) : !item.soldOut;
  const embed = videoEmbed(item.videoUrl || '');
  const doubt = whatsappLink(store.phone, `Olá! Vi o ${item.name}${variant?.label ? ` (${variant.label})` : ''} no catálogo da ${store.name || 'loja'}. Pode me ajudar?`);
  const style = { '--cat-accent': look.accent || '#e4572e' } as CSSProperties;
  const interest = whatsappLink(store.phone, `Olá! Tenho interesse no ${item.name}${variant?.label ? ` (${variant.label})` : ''}${look.showPrices && price > 0 ? ` de ${money(price)}` : ''}, que vi no catálogo da ${store.name || 'loja'}.`);

  return (
    <div className="psheet" style={style} role="dialog" aria-modal="true" aria-label={item.name}>
      <header className="psheet__head">
        <button type="button" className="psheet__back" onClick={onClose} aria-label="Voltar ao catálogo">
          ←
        </button>
        <strong>{item.name}</strong>
      </header>

      <div className="psheet__body">
        <div className="psheet__media">
          {item.image && !imageFailed ? <img src={item.image} alt={item.name} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /> : <span className="psheet__noimg">{item.name}</span>}
          <span className="psheet__badges">
            {item.isNew ? <span className="catalog-badge catalog-badge--new">Novidade</span> : null}
            {variant && variant.condition !== 'Novo' ? <span className="catalog-badge">{variant.condition}</span> : null}
          </span>
        </div>

        <section className="psheet__info">
          {item.brand ? <span className="psheet__brand">{item.brand}</span> : null}
          <h1>{item.name}</h1>

          {capacities.length > 1 || (capacities.length === 1 && variants.length > 1) ? (
            <div className="psheet__group">
              <span className="psheet__label">
                Armazenamento: <strong>{capacity || '—'}</strong>
              </span>
              <div className="psheet__chips" role="radiogroup" aria-label="Armazenamento">
                {capacities.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={capacity === value} className={`${capacity === value ? 'is-on' : ''}${available('capacity', value) ? '' : ' is-off'}`} onClick={() => choose({ capacity: value })}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {colors.length ? (
            <div className="psheet__group">
              <span className="psheet__label">
                Cor: <strong>{color || '—'}</strong>
              </span>
              <div className="psheet__dots" role="radiogroup" aria-label="Cor">
                {colors.map((value) => {
                  const hex = colorHex(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={color === value}
                      aria-label={value}
                      title={value}
                      className={`psheet__dot${color === value ? ' is-on' : ''}${available('color', value) ? '' : ' is-off'}${hex ? '' : ' is-text'}${hex && isLightColor(hex) ? ' is-light' : ''}`}
                      style={hex ? { background: hex } : undefined}
                      onClick={() => choose({ color: value })}
                    >
                      {hex ? null : value.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {conditions.length > 1 ? (
            <div className="psheet__group">
              <span className="psheet__label">
                Condição: <strong>{condition}</strong>
              </span>
              <div className="psheet__chips" role="radiogroup" aria-label="Condição">
                {conditions.map((value) => (
                  <button key={value} type="button" role="radio" aria-checked={condition === value} className={`${condition === value ? 'is-on' : ''}${available('condition', value) ? '' : ' is-off'}`} onClick={() => choose({ condition: value })}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="psheet__status">
            {variant ? (
              <span className={`psheet__avail psheet__avail--${variant.availability}`}>{availabilityText(variant)}</span>
            ) : variants.length ? (
              <span className="psheet__avail psheet__avail--sold_out">Essa combinação não está disponível</span>
            ) : (
              <span className={`psheet__avail psheet__avail--${item.orderOnly ? 'order' : 'in_stock'}`}>{item.orderOnly ? 'Sob encomenda' : 'Pronta entrega'}</span>
            )}
            {variant?.batteries.length ? <span className="catalog-tag catalog-tag--battery">🔋 Bateria {variant.batteries.map((b) => `${b}%`).join(' · ')}</span> : null}
          </div>

          {look.showPrices && price > 0 ? (
            <div className="psheet__price">
              <strong>{money(price)}</strong>
              <small>à vista</small>
            </div>
          ) : (
            <p className="psheet__ask">Consulte o preço</p>
          )}
          {doubt ? (
            <a className="psheet__doubt" href={doubt} target="_blank" rel="noreferrer">
              Tirar dúvida no WhatsApp
            </a>
          ) : null}
        </section>

        {embed ? (
          <section className="psheet__section">
            <h2>Vídeo</h2>
            <div className="psheet__video">
              {embed.kind === 'youtube' ? (
                <iframe src={embed.src} title={`Vídeo do ${item.name}`} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen loading="lazy" />
              ) : (
                <video src={embed.src} controls preload="metadata" playsInline />
              )}
            </div>
          </section>
        ) : null}

        {item.specs.length ? (
          <section className="psheet__section">
            <h2>Ficha técnica</h2>
            <dl className="psheet__specs">
              {item.specs.map((line, index) => (
                <div key={index}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <footer className="psheet__bar">
        <div className="psheet__bar-price">
          {look.showPrices && price > 0 ? <strong>{money(price)}</strong> : <strong>Consulte</strong>}
          <small>{variant?.label || item.condition || ''}</small>
        </div>
        {sells ? (
          canBuy ? (
            <button type="button" className="psheet__add" onClick={() => onAdd(item, variants.length ? variant : null)}>
              Adicionar à sacola
            </button>
          ) : onRequest ? (
            <button type="button" className="psheet__add" onClick={() => onRequest(item, variants.length ? variant : null)}>
              Solicitar ao vendedor
            </button>
          ) : (
            <button type="button" className="psheet__add" disabled>
              Indisponível
            </button>
          )
        ) : interest && canBuy ? (
          <a className="psheet__add psheet__add--wa" href={interest} target="_blank" rel="noreferrer">
            Tenho interesse
          </a>
        ) : onRequest && !canBuy ? (
          <button type="button" className="psheet__add" onClick={() => onRequest(item, variants.length ? variant : null)}>
            Solicitar ao vendedor
          </button>
        ) : (
          <button type="button" className="psheet__add" disabled>
            {canBuy ? 'Fale com a loja' : 'Indisponível'}
          </button>
        )}
      </footer>
    </div>
  );
}
