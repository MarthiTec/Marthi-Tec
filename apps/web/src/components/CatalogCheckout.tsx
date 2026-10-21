import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { availabilityText, catalogMoney as money, UPGRADE_CHECKLIST, whatsappLink, type CatalogItem, type CatalogStore, type CatalogVariant } from './CatalogDocument';
import { apiSubmitCatalogOrder, type CatalogCustomerInput, type CatalogSeller, type CatalogTradeInInput } from '../services/salesCatalogApi';
import { AdminPicker } from '../design-system';
import { ChoiceField } from './ChoiceField';
import './catalogCheckout.css';

export type BagLine = { key: string; item: CatalogItem; variant: CatalogVariant | null; qty: number };
export type CheckoutMode = 'order' | 'signup' | 'upgrade';

const PAYMENTS = [
  ['PIX', 'PIX'],
  ['Cartão de Crédito', 'Crédito'],
  ['Cartão de Débito', 'Débito'],
  ['Dinheiro', 'Dinheiro'],
  ['Transferência Bancária', 'Transferência'],
] as const;
const emptyCustomer = (): CatalogCustomerInput => ({ name: '', documentType: 'cpf', document: '', rg: '', phone: '', email: '', zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: '' });
const emptyTrade = (): CatalogTradeInInput => ({ device: '', capacity: '', color: '', imei: '', battery: null, condition: 'perfect', screenReplaced: false, opened: false, faceIdOk: true, hasBox: false, hasInvoice: false, notes: '' });
const onlyDigits = (value: string) => value.replace(/\D/g, '');
const maskPhone = (value: string) => {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};
const maskDoc = (value: string) => {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
const maskCep = (value: string) => onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');

/**
 * Pedido pelo catálogo, no celular: sacola, cadastro do cliente (para a loja só aprovar), quem atendeu,
 * pagamento, retirada e o aparelho da troca. Vai para a fila da venda externa da loja.
 */
export function CatalogCheckout({
  token,
  mode,
  accent,
  store,
  sellers,
  bag,
  onBagChange,
  onClose,
  onDone,
}: {
  token: string;
  mode: CheckoutMode;
  accent: string;
  store: CatalogStore;
  sellers: CatalogSeller[];
  bag: BagLine[];
  onBagChange: (lines: BagLine[]) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [customer, setCustomer] = useState<CatalogCustomerInput>(emptyCustomer);
  const [sellerId, setSellerId] = useState('');
  const [payment, setPayment] = useState<string>('PIX');
  const [installments, setInstallments] = useState(1);
  const [fulfillment, setFulfillment] = useState<'store' | 'delivery'>('store');
  const [withTrade, setWithTrade] = useState(mode === 'upgrade');
  const [trade, setTrade] = useState<CatalogTradeInInput>(emptyTrade);
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState('');
  const [cepStatus, setCepStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ code: string; total: number } | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const isOrder = bag.length > 0;
  const total = useMemo(() => bag.reduce((sum, line) => sum + (line.variant?.price ?? line.item.price) * line.qty, 0), [bag]);
  const set = (patch: Partial<CatalogCustomerInput>) => setCustomer((value) => ({ ...value, ...patch }));
  const setT = (patch: Partial<CatalogTradeInInput>) => setTrade((value) => ({ ...value, ...patch }));

  async function lookupCep(value: string) {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return;
    setCepStatus('Buscando endereço…');
    try {
      const data = await (await fetch(`https://viacep.com.br/ws/${digits}/json/`)).json();
      if (data.erro) return setCepStatus('CEP não encontrado. Preencha o endereço.');
      setCustomer((current) => ({ ...current, street: current.street || data.logradouro || '', district: current.district || data.bairro || '', city: data.localidade || current.city, state: data.uf || current.state }));
      setCepStatus('');
    } catch {
      setCepStatus('Não consegui buscar o CEP. Preencha o endereço.');
    }
  }

  async function submit() {
    setError('');
    if (customer.name.trim().split(/\s+/).length < 2) return setError('Informe seu nome completo.');
    if (onlyDigits(customer.phone).length < 10) return setError('Informe seu celular com DDD.');
    if (customer.document && ![11, 14].includes(onlyDigits(customer.document).length)) return setError('CPF ou CNPJ incompleto.');
    if (fulfillment === 'delivery' && (!customer.street || !customer.number || !customer.city)) return setError('Para entrega, informe rua, número e cidade.');
    if (withTrade && trade.device.trim().length < 2) return setError('Informe o modelo do aparelho que vai dar na troca.');
    setBusy(true);
    try {
      const result = await apiSubmitCatalogOrder(token, {
        kind: isOrder ? 'order' : 'signup',
        requestKey: requestKey.current,
        customer: { ...customer, documentType: onlyDigits(customer.document).length === 14 ? 'cnpj' : 'cpf', state: customer.state.toUpperCase() },
        sellerId: sellerId || null,
        items: bag.map((line) => ({ productId: line.item.id, attributes: (line.variant?.attributes ?? []).map((attr) => ({ id: attr.id, value: attr.value })), qty: line.qty })),
        payment,
        installments: payment === 'Cartão de Crédito' ? installments : 1,
        fulfillment,
        tradeIn: withTrade ? trade : null,
        notes,
        website,
      });
      setDone({ code: result.code, total: result.total });
      onBagChange([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const style = { '--cat-accent': accent } as CSSProperties;
  if (done) {
    const notify = whatsappLink(store.phone, `Olá! Acabei de enviar ${isOrder || done.total > 0 ? `o pedido ${done.code}` : `meu cadastro (${done.code})`} pelo catálogo da ${store.name}.`);
    return (
      <div className="checkout" style={style} role="dialog" aria-modal="true" aria-label="Pedido enviado">
        <div className="checkout__done">
          <span className="checkout__ok" aria-hidden>
            ✓
          </span>
          <h2>{done.total > 0 ? 'Pedido enviado!' : 'Cadastro enviado!'}</h2>
          <p>
            Código <strong>{done.code}</strong>
            {done.total > 0 ? ` · ${money(done.total)}` : ''}
          </p>
          <p className="checkout__muted">A {store.name || 'loja'} já recebeu e vai te chamar para confirmar{done.total > 0 ? ' o pagamento e a retirada' : ''}.</p>
          {notify ? (
            <a className="checkout__wa" href={notify} target="_blank" rel="noreferrer">
              Avisar a loja no WhatsApp
            </a>
          ) : null}
          <button type="button" className="checkout__ghost" onClick={onDone}>
            Voltar ao catálogo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout" style={style} role="dialog" aria-modal="true" aria-label={isOrder ? 'Finalizar pedido' : 'Meu cadastro'}>
      <header className="checkout__head">
        <button type="button" className="checkout__back" onClick={onClose} aria-label="Voltar ao catálogo">
          ←
        </button>
        <strong>{isOrder ? 'Finalizar pedido' : mode === 'upgrade' ? 'Upgrade: meus dados' : 'Meu cadastro'}</strong>
      </header>

      <div className="checkout__body">
        {isOrder ? (
          <section className="checkout__card">
            <h3>Sua sacola</h3>
            <ul className="checkout__bag">
              {bag.map((line) => (
                <li key={line.key}>
                  {line.item.image ? <img src={line.item.image} alt="" referrerPolicy="no-referrer" /> : <span className="checkout__noimg">{line.item.name.slice(0, 1)}</span>}
                  <div>
                    <strong>{line.item.name}</strong>
                    <small>
                      {[line.variant?.label, line.variant && line.variant.condition !== 'Novo' ? line.variant.condition : '', line.variant ? availabilityText(line.variant) : ''].filter(Boolean).join(' · ')}
                    </small>
                    <span className="checkout__price">{money((line.variant?.price ?? line.item.price) * line.qty)}</span>
                  </div>
                  <div className="checkout__qty">
                    <button
                      type="button"
                      aria-label="Menos um"
                      onClick={() => {
                        const next = line.qty > 1 ? bag.map((l) => (l.key === line.key ? { ...l, qty: l.qty - 1 } : l)) : bag.filter((l) => l.key !== line.key);
                        onBagChange(next);
                        // Tirou o último item: volta para o catálogo.
                        if (!next.length) onClose();
                      }}
                    >
                      −
                    </button>
                    <span>{line.qty}</span>
                    <button type="button" aria-label="Mais um" disabled={line.qty >= 3} onClick={() => onBagChange(bag.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)))}>
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="checkout__total">
              Total <strong>{money(total)}</strong>
            </p>
          </section>
        ) : (
          <section className="checkout__card checkout__intro">
            <p>{mode === 'upgrade' ? 'Adiante seus dados e os do aparelho da troca. A loja avalia e te chama.' : 'Faça seu cadastro: a loja só confirma e você já fica pronto para comprar.'}</p>
          </section>
        )}

        <section className="checkout__card">
          <h3>Seus dados</h3>
          <label>
            Nome completo *
            <input value={customer.name} autoComplete="name" onChange={(e) => set({ name: e.target.value })} placeholder="Como no documento" />
          </label>
          <div className="checkout__row">
            <label>
              Celular (WhatsApp) *
              <input value={customer.phone} type="tel" inputMode="tel" autoComplete="tel" onChange={(e) => set({ phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
            </label>
            <label>
              CPF ou CNPJ
              <input value={customer.document} inputMode="numeric" onChange={(e) => set({ document: maskDoc(e.target.value) })} placeholder="000.000.000-00" />
            </label>
          </div>
          <div className="checkout__row">
            <label>
              RG
              <input value={customer.rg} onChange={(e) => set({ rg: e.target.value })} />
            </label>
            <label>
              E-mail
              <input value={customer.email} type="email" inputMode="email" autoComplete="email" onChange={(e) => set({ email: e.target.value })} placeholder="voce@email.com" />
            </label>
          </div>
          <div className="checkout__row checkout__row--cep">
            <label>
              CEP
              <input value={customer.zipCode} inputMode="numeric" autoComplete="postal-code" onChange={(e) => set({ zipCode: maskCep(e.target.value) })} onBlur={(e) => void lookupCep(e.target.value)} placeholder="00000-000" />
            </label>
            <label>
              Número
              <input value={customer.number} inputMode="numeric" onChange={(e) => set({ number: e.target.value })} />
            </label>
          </div>
          {cepStatus ? <small className="checkout__muted">{cepStatus}</small> : null}
          <label>
            Rua
            <input value={customer.street} autoComplete="address-line1" onChange={(e) => set({ street: e.target.value })} />
          </label>
          <div className="checkout__row">
            <label>
              Bairro
              <input value={customer.district} onChange={(e) => set({ district: e.target.value })} />
            </label>
            <label>
              Complemento
              <input value={customer.complement} onChange={(e) => set({ complement: e.target.value })} />
            </label>
          </div>
          <div className="checkout__row checkout__row--city">
            <label>
              Cidade
              <input value={customer.city} autoComplete="address-level2" onChange={(e) => set({ city: e.target.value })} />
            </label>
            <label>
              UF
              <input value={customer.state} maxLength={2} autoComplete="address-level1" onChange={(e) => set({ state: e.target.value.toUpperCase() })} />
            </label>
          </div>
          {/* Campo escondido contra robô. */}
          <input className="checkout__hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
        </section>

        {sellers.length ? (
          <section className="checkout__card">
            <h3>Quem te atendeu?</h3>
            <ChoiceField
              label="Quem te atendeu"
              noun="vendedores"
              placeholder="Ninguém ainda"
              choices={[{ value: '', label: 'Ninguém ainda' }, ...sellers.map((seller) => ({ value: seller.id, label: seller.name }))]}
              value={sellerId}
              onChange={setSellerId}
            />
          </section>
        ) : null}

        {isOrder ? (
          <section className="checkout__card">
            <h3>Pagamento</h3>
            <div className="checkout__chips">
              {PAYMENTS.map(([value, label]) => (
                <button key={value} type="button" className={payment === value ? 'is-on' : ''} onClick={() => setPayment(value)}>
                  {label}
                </button>
              ))}
            </div>
            {payment === 'Cartão de Crédito' ? (
              <AdminPicker
                label="Parcelas"
                value={String(installments)}
                options={Array.from({ length: 18 }, (_, i) => i + 1).map((n) => ({
                  value: String(n),
                  label: n === 1 ? 'À vista' : `${n}x`,
                }))}
                onChange={(value) => setInstallments(Number(value) || 1)}
              />
            ) : null}
            <small className="checkout__muted">O pagamento é feito com a loja, na confirmação do pedido.{payment === 'Cartão de Crédito' && installments > 1 ? ' Juros do cartão conforme a maquininha.' : ''}</small>
            <h3>Retirada</h3>
            <div className="checkout__chips">
              <button type="button" className={fulfillment === 'store' ? 'is-on' : ''} onClick={() => setFulfillment('store')}>
                Retirar na loja
              </button>
              <button type="button" className={fulfillment === 'delivery' ? 'is-on' : ''} onClick={() => setFulfillment('delivery')}>
                Entrega no endereço
              </button>
            </div>
          </section>
        ) : null}

        <section className="checkout__card">
          <label className="checkout__switch">
            <input type="checkbox" checked={withTrade} onChange={(e) => setWithTrade(e.target.checked)} />
            Vou dar um aparelho na troca (Upgrade)
          </label>
          {withTrade ? (
            <>
              <ul className="checkout__checklist">
                {UPGRADE_CHECKLIST.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <label>
                Modelo *
                <input value={trade.device} onChange={(e) => setT({ device: e.target.value })} placeholder="Ex.: iPhone 13 Pro" />
              </label>
              <div className="checkout__row">
                <label>
                  Capacidade
                  <input value={trade.capacity} onChange={(e) => setT({ capacity: e.target.value })} placeholder="128GB" />
                </label>
                <label>
                  Cor
                  <input value={trade.color} onChange={(e) => setT({ color: e.target.value })} />
                </label>
              </div>
              <div className="checkout__row">
                <label>
                  IMEI
                  <input value={trade.imei} inputMode="numeric" onChange={(e) => setT({ imei: onlyDigits(e.target.value).slice(0, 15) })} placeholder="*#06#" />
                </label>
                <label>
                  Bateria (%)
                  <input value={trade.battery ?? ''} type="number" inputMode="numeric" min={0} max={100} onChange={(e) => setT({ battery: e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })} placeholder="Ex.: 87" />
                </label>
              </div>
              <span className="checkout__label">Estado</span>
              <div className="checkout__chips">
                {(
                  [
                    ['perfect', 'Perfeito'],
                    ['marks', 'Marcas de uso'],
                    ['damaged', 'Avariado'],
                  ] as const
                ).map(([value, label]) => (
                  <button key={value} type="button" className={trade.condition === value ? 'is-on' : ''} onClick={() => setT({ condition: value })}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="checkout__checks">
                <label>
                  <input type="checkbox" checked={trade.screenReplaced} onChange={(e) => setT({ screenReplaced: e.target.checked })} /> Tela já trocada
                </label>
                <label>
                  <input type="checkbox" checked={trade.opened} onChange={(e) => setT({ opened: e.target.checked })} /> Já foi aberto
                </label>
                <label>
                  <input type="checkbox" checked={trade.faceIdOk} onChange={(e) => setT({ faceIdOk: e.target.checked })} /> Face ID / Touch ID ok
                </label>
                <label>
                  <input type="checkbox" checked={trade.hasBox} onChange={(e) => setT({ hasBox: e.target.checked })} /> Tem caixa
                </label>
                <label>
                  <input type="checkbox" checked={trade.hasInvoice} onChange={(e) => setT({ hasInvoice: e.target.checked })} /> Tem nota fiscal
                </label>
              </div>
              <label>
                Mais alguma coisa sobre o aparelho?
                <textarea rows={2} value={trade.notes} onChange={(e) => setT({ notes: e.target.value })} placeholder="Ex.: risco na lateral, câmera embaçada" />
              </label>
            </>
          ) : null}
        </section>

        <section className="checkout__card">
          <label>
            Observação
            <textarea rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Algum recado para a loja?" />
          </label>
        </section>
      </div>

      <footer className="checkout__foot">
        {error ? (
          <p role="alert" className="checkout__error">
            {error}
          </p>
        ) : null}
        <button type="button" className="checkout__send" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Enviando…' : isOrder ? `Enviar pedido · ${money(total)}` : 'Enviar meu cadastro'}
        </button>
      </footer>
    </div>
  );
}
