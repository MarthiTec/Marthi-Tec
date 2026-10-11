import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { adsApi, type AdsOffer } from '../../services/adsApi';
import { nestGet } from '../../services/nestClient';
import './ads.css';

const onlyDigits = (value: string) => value.replace(/\D/g, '');

/** Página pública do produto (destino do anúncio): só dados públicos da oferta e contato da loja. */
export function OfferPublicPage() {
  const { storeId = '', productId = '' } = useParams();
  const [params] = useSearchParams();
  const [offer, setOffer] = useState<AdsOffer | null>(null);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    adsApi
      .publicOffer(storeId, productId, params.get('v'))
      .then((data) => {
        setOffer(data);
        document.title = `${data.title} · ${data.store.name || 'Oferta'}`;
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Oferta não encontrada.'));
  }, [storeId, productId, params]);

  if (error) {
    return (
      <main className="offer-page">
        <div className="offer-page__main" style={{ display: 'block' }}>
          <p className="offer-page__unavailable">Esta oferta não está mais disponível.</p>
        </div>
      </main>
    );
  }
  if (!offer) return <main className="offer-page" />;
  const phone = onlyDigits(offer.store.phone);
  const whatsapp = phone ? `https://wa.me/${phone.length <= 11 ? `55${phone}` : phone}?text=${encodeURIComponent(`Olá! Tenho interesse em: ${offer.title} (${offer.conditionLabel}) por ${offer.priceLabel}.`)}` : '';
  const instagram = offer.store.instagram ? `https://instagram.com/${offer.store.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}` : '';
  return (
    <main className="offer-page">
      <header className="offer-page__store">
        {offer.store.logo ? <img src={offer.store.logo} alt="" /> : null}
        <strong>{offer.store.name}</strong>
      </header>
      <div className="offer-page__main">
        <section className="offer-page__gallery">
          {offer.images.length ? <img src={offer.images[photo] ?? offer.images[0]} alt={offer.title} /> : null}
          {offer.images.length > 1 ? (
            <div className="offer-page__thumbs">
              {offer.images.map((src, index) => (
                <button key={index} type="button" className={index === photo ? 'is-active' : ''} onClick={() => setPhoto(index)} aria-label={`Foto ${index + 1}`}>
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <section className="offer-page__info">
          {offer.brand ? <small>{offer.brand}</small> : null}
          <h1>{offer.title}</h1>
          <div className="offer-page__tags">
            {offer.details.map((detail) => (
              <span key={detail}>{detail}</span>
            ))}
          </div>
          <div className="offer-page__price">{offer.priceLabel}</div>
          {!offer.available ? <p className="offer-page__unavailable">Indisponível no momento. Fale com a loja para saber quando chega.</p> : null}
          {offer.pickup.length ? (
            <ul className="offer-page__pickup">
              {offer.pickup.map((item) => (
                <li key={item.kind + item.label}>
                  <span>{item.label}</span>
                  <strong>{item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </li>
              ))}
            </ul>
          ) : null}
          {whatsapp ? (
            <a className="offer-page__cta" href={whatsapp} target="_blank" rel="noreferrer">
              Falar com a loja no WhatsApp
            </a>
          ) : null}
          {instagram ? (
            <a className="offer-page__cta is-secondary" href={instagram} target="_blank" rel="noreferrer">
              Ver a loja no Instagram
            </a>
          ) : null}
        </section>
      </div>
    </main>
  );
}

/** Situação de um pedido de exclusão de dados feito no Facebook (link devolvido à Meta). */
export function DataDeletionStatusPage() {
  const [params] = useSearchParams();
  const code = params.get('codigo') ?? '';
  const [state, setState] = useState<{ status: string; requestedAt: string } | null | undefined>(undefined);
  useEffect(() => {
    if (!code) return setState(null);
    nestGet<{ status: string; requestedAt: string } | null>(`/ads/meta/data-deletion/${encodeURIComponent(code)}`)
      .then((data) => setState(data ?? null))
      .catch(() => setState(null));
  }, [code]);
  return (
    <main className="offer-page">
      <div className="offer-page__main" style={{ display: 'block', maxWidth: 640 }}>
        <h1>Exclusão de dados — Marthi</h1>
        {state === undefined ? (
          <p>Consultando…</p>
        ) : state ? (
          <p>
            Pedido <strong>{code}</strong> recebido em {new Date(state.requestedAt).toLocaleString('pt-BR')}: <strong>{state.status === 'done' ? 'concluído' : state.status}</strong>. Os tokens de acesso da
            Meta foram apagados e a conexão foi removida das lojas ligadas a essa conta. Registros de campanhas já criadas na Meta continuam no histórico da loja, sem dados pessoais da conta.
          </p>
        ) : (
          <p>Código de confirmação não encontrado.</p>
        )}
      </div>
    </main>
  );
}
