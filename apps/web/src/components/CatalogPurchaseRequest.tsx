import { useRef, useState, type CSSProperties } from 'react';
import { apiSubmitPurchaseRequest } from '../services/purchaseRequestsApi';
import { whatsappLink, type CatalogItem, type CatalogStore, type CatalogVariant } from './CatalogDocument';
import './catalogPurchaseRequest.css';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};
const newKey = () => `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * "Solicitar ao vendedor": o cliente pede um produto/opção indisponível no catálogo digital.
 * Gera protocolo; a loja atende em Solicitações de compras.
 */
export function CatalogPurchaseRequest({
  token,
  store,
  accent,
  item,
  variant,
  onClose,
}: {
  token: string;
  store: CatalogStore;
  accent: string;
  item?: CatalogItem | null;
  variant?: CatalogVariant | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [desired, setDesired] = useState(
    [variant?.label, variant?.capacity, variant?.color, variant?.condition].filter(Boolean).join(' · ') || '',
  );
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState('');
  const requestKey = useRef(newKey());
  const style = { '--cat-accent': accent || '#e4572e' } as CSSProperties;
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const canSend = name.trim().length >= 3 && phoneOk && (Boolean(item) || desired.trim().length >= 5);

  async function send() {
    if (!canSend || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiSubmitPurchaseRequest(token, {
        requestKey: requestKey.current,
        productId: item?.id ?? null,
        productName: item?.name ?? '',
        brand: item?.brand ?? '',
        variantLabel: variant?.label ?? '',
        attributes: (variant?.attributes ?? []).map((a) => ({ id: a.id, name: a.name, value: a.value })),
        qty,
        desiredOptions: desired.trim(),
        notes: notes.trim(),
        customer: { name: name.trim(), phone },
        website,
      });
      setProtocol(result.protocol);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setBusy(false);
    }
  }

  const wa = protocol
    ? whatsappLink(
        store.phone,
        `Olá! Enviei a solicitação ${protocol}${item ? ` do ${item.name}` : ''}${desired ? ` (${desired})` : ''} pelo catálogo da ${store.name || 'loja'}.`,
      )
    : '';

  return (
    <div className="cpr" style={style} role="dialog" aria-modal="true" aria-label="Solicitar ao vendedor">
      <header className="cpr__head">
        <button type="button" className="cpr__back" onClick={onClose} aria-label="Fechar">
          ←
        </button>
        <strong>Solicitar ao vendedor</strong>
      </header>

      {protocol ? (
        <div className="cpr__done">
          <p>Pedido enviado. Guarde o protocolo:</p>
          <strong className="cpr__protocol">{protocol}</strong>
          <p>A loja vai entrar em contato pelo WhatsApp informado.</p>
          {wa ? (
            <a className="cpr__btn" href={wa} target="_blank" rel="noreferrer">
              Avisar a loja no WhatsApp
            </a>
          ) : null}
          <button type="button" className="cpr__btn cpr__btn--ghost" onClick={onClose}>
            Voltar ao catálogo
          </button>
        </div>
      ) : (
        <form
          className="cpr__form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <p className="cpr__lead">
            {item
              ? `Este item ou opção não está disponível agora. Peça à loja para providenciar${item.name ? ` o ${item.name}` : ''}.`
              : 'Descreva o que você procura e a loja verifica disponibilidade.'}
          </p>

          {item ? (
            <div className="cpr__product">
              <strong>{item.name}</strong>
              {variant?.label || desired ? <span>{variant?.label || desired}</span> : null}
            </div>
          ) : null}

          <label>
            Opções desejadas (cor, capacidade, condição…)
            <input value={desired} onChange={(e) => setDesired(e.target.value)} placeholder="Ex.: 256 GB · Preto · Seminovo" />
          </label>

          <label>
            Quantidade
            <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} />
          </label>

          <label>
            Seu nome
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>

          <label>
            WhatsApp com DDD
            <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} inputMode="tel" autoComplete="tel" required />
          </label>

          <label>
            Observação (opcional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Prazo, urgência, troca…" />
          </label>

          <input className="cpr__honey" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden />

          {error ? (
            <p className="cpr__error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="cpr__btn" disabled={!canSend || busy}>
            {busy ? 'Enviando…' : 'Enviar solicitação'}
          </button>
        </form>
      )}
    </div>
  );
}
