import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  apiPublicPurchaseBuilder,
  apiSubmitPurchaseRequest,
  type PurchaseBuilderOptions,
} from '../services/purchaseRequestsApi';
import { ChoiceField } from './ChoiceField';
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
const composeDescription = (brandName: string, typeName: string, modelName: string) =>
  [brandName, typeName, modelName].filter(Boolean).join(' ').toUpperCase();

/**
 * "Solicitar ao vendedor": marca → tipo → modelo (descrição automática) → cor → capacidade.
 * Mesmo padrão de assistência do cadastro de estoque; gera protocolo na fila da loja.
 */
export function CatalogPurchaseRequest({
  token,
  store,
  accent,
  item,
  variant,
  initialQuery = '',
  onClose,
}: {
  token: string;
  store: CatalogStore;
  accent: string;
  item?: CatalogItem | null;
  variant?: CatalogVariant | null;
  /** Pré-preenche texto livre (ex.: busca sem resultado). */
  initialQuery?: string;
  onClose: () => void;
}) {
  const listed = Boolean(item);
  const [options, setOptions] = useState<PurchaseBuilderOptions | null>(null);
  const [brandSlug, setBrandSlug] = useState('');
  const [typeId, setTypeId] = useState('');
  const [modelId, setModelId] = useState('');
  const [color, setColor] = useState(variant?.color ?? '');
  const [capacity, setCapacity] = useState(variant?.capacity ?? '');
  const [condition, setCondition] = useState<'new' | 'used'>('new');
  const [description, setDescription] = useState(item?.name ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState(initialQuery && !item ? `Busca: ${initialQuery}` : '');
  const [website, setWebsite] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(true);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState('');
  const requestKey = useRef(newKey());
  const style = { '--cat-accent': accent || '#e4572e' } as CSSProperties;

  useEffect(() => {
    let alive = true;
    setLoadingOpts(true);
    apiPublicPurchaseBuilder(token, brandSlug ? { brand: brandSlug } : undefined)
      .then((data) => {
        if (!alive) return;
        setOptions((prev) => ({
          brands: data.brands,
          types: brandSlug ? data.types : prev?.types ?? [],
          models: prev?.models ?? [],
          colors: data.colors,
          capacities: data.capacities,
        }));
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar as opções.'))
      .finally(() => alive && setLoadingOpts(false));
    return () => {
      alive = false;
    };
  }, [token, brandSlug]);

  useEffect(() => {
    if (!typeId) {
      setOptions((prev) => (prev ? { ...prev, models: [] } : prev));
      return;
    }
    let alive = true;
    apiPublicPurchaseBuilder(token, { brand: brandSlug || undefined, typeId })
      .then((data) => {
        if (!alive) return;
        setOptions((prev) => (prev ? { ...prev, models: data.models, colors: data.colors, capacities: data.capacities } : data));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token, brandSlug, typeId]);

  const brandName = options?.brands.find((b) => b.slug === brandSlug)?.name ?? '';
  const typeName = options?.types.find((t) => t.id === typeId)?.name ?? '';
  const modelName = options?.models.find((m) => m.id === modelId)?.name ?? '';

  useEffect(() => {
    if (listed) return;
    if (!typeName && !modelName) return;
    setDescription(composeDescription(brandName, typeName, modelName));
  }, [listed, brandName, typeName, modelName]);

  const colors = useMemo(() => {
    const list = [...(options?.colors ?? [])];
    if (variant?.color && !list.includes(variant.color)) list.unshift(variant.color);
    return list;
  }, [options?.colors, variant?.color]);
  const capacities = useMemo(() => {
    const list = [...(options?.capacities ?? [])];
    if (variant?.capacity && !list.includes(variant.capacity)) list.unshift(variant.capacity);
    return list;
  }, [options?.capacities, variant?.capacity]);

  const deviceReady = listed || Boolean(brandSlug && typeId && modelId && description.trim().length >= 3);
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const canSend = deviceReady && name.trim().length >= 3 && phoneOk;

  async function send() {
    if (!canSend || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiSubmitPurchaseRequest(token, {
        requestKey: requestKey.current,
        productId: item?.id ?? null,
        productName: description.trim() || item?.name || '',
        brand: brandSlug || item?.brand || '',
        catalogTypeId: typeId || null,
        catalogModelId: modelId || null,
        deviceType: typeName,
        deviceModel: modelName,
        color,
        capacity,
        condition,
        variantLabel: [capacity, color].filter(Boolean).join(' · ') || variant?.label || '',
        attributes: [
          ...(color ? [{ id: 'color', name: 'Cor', value: color }] : []),
          ...(capacity ? [{ id: 'capacity', name: 'Capacidade', value: capacity }] : []),
        ],
        qty,
        desiredOptions: [description.trim(), capacity, color, condition === 'used' ? 'usado' : 'novo'].filter(Boolean).join(' · '),
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
        `Olá! Enviei a solicitação ${protocol}${description ? ` do ${description}` : ''}${capacity || color ? ` (${[capacity, color].filter(Boolean).join(' · ')})` : ''} pelo catálogo da ${store.name || 'loja'}.`,
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
            {listed
              ? `Este item ou opção não está disponível agora. Confirme o aparelho e peça à loja para providenciar.`
              : 'Não achou no catálogo? Escolha marca, tipo e modelo — a descrição monta sozinha — e depois cor e capacidade.'}
          </p>

          {listed && item ? (
            <div className="cpr__product">
              <strong>{item.name}</strong>
              {variant?.label ? <span>{variant.label}</span> : null}
            </div>
          ) : null}

          {!listed ? (
            <>
              {loadingOpts && !options ? <p className="cpr__muted">Carregando marcas…</p> : null}
              <ChoiceField
                label="Marca"
                noun="marcas"
                placeholder="Escolha a marca"
                value={brandSlug}
                choices={(options?.brands ?? []).map((b) => ({ value: b.slug, label: b.name }))}
                onChange={(value) => {
                  setBrandSlug(value);
                  setTypeId('');
                  setModelId('');
                  setDescription('');
                }}
              />
              <ChoiceField
                label="Tipo"
                noun="tipos"
                placeholder={brandSlug ? 'Escolha o tipo' : 'Escolha a marca antes'}
                value={typeId}
                choices={brandSlug ? (options?.types ?? []).map((t) => ({ value: t.id, label: t.name })) : []}
                onChange={(value) => {
                  setTypeId(value);
                  setModelId('');
                }}
              />
              <ChoiceField
                label="Modelo"
                noun="modelos"
                placeholder={typeId ? 'Escolha o modelo' : 'Escolha o tipo antes'}
                value={modelId}
                choices={typeId ? (options?.models ?? []).map((m) => ({ value: m.id, label: m.name })) : []}
                onChange={setModelId}
              />
              {description ? (
                <div className="cpr__desc" aria-live="polite">
                  <span>Descrição</span>
                  <strong>{description}</strong>
                </div>
              ) : null}
            </>
          ) : null}

          {deviceReady || listed ? (
            <>
              {colors.length ? (
                <ChoiceField
                  label="Cor"
                  noun="cores"
                  placeholder="Escolha a cor"
                  value={color}
                  choices={colors.map((value) => ({ value, label: value }))}
                  onChange={setColor}
                  maxChips={12}
                />
              ) : (
                <label>
                  Cor (opcional)
                  <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Ex.: Preto" />
                </label>
              )}
              {capacities.length ? (
                <ChoiceField
                  label="Capacidade"
                  noun="capacidades"
                  placeholder="Escolha a capacidade"
                  value={capacity}
                  choices={capacities.map((value) => ({ value, label: value }))}
                  onChange={setCapacity}
                  maxChips={12}
                />
              ) : (
                <label>
                  Capacidade (opcional)
                  <input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Ex.: 256 GB" />
                </label>
              )}
              <fieldset className="cpr__condition">
                <legend>Condição</legend>
                <div className="cpr__condition-row" role="group" aria-label="Condição do aparelho">
                  <button
                    type="button"
                    className={condition === 'new' ? 'is-on' : ''}
                    aria-pressed={condition === 'new'}
                    onClick={() => setCondition('new')}
                  >
                    Novo
                  </button>
                  <button
                    type="button"
                    className={condition === 'used' ? 'is-on' : ''}
                    aria-pressed={condition === 'used'}
                    onClick={() => setCondition('used')}
                  >
                    Usado
                  </button>
                </div>
              </fieldset>
            </>
          ) : null}

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
