import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../../components/BrandLogo';
import { submitTotemLead } from '../../services/totem';
import { ProductCarousel } from './ProductCarousel';
import {
  FULFILLMENT_OPTIONS,
  INSTALLMENTS,
  PAYMENT_OPTIONS,
  TOTEM_BRANDS,
  TOTEM_PRODUCTS,
  formatBRL,
  type TotemBrand,
  type TotemProduct,
} from './totemData';
import './totem.css';

type Step = 'welcome' | 'catalog' | 'configure' | 'checkout' | 'done';

type Selection = {
  product: TotemProduct;
  storage: string;
  color: string;
  fulfillment: string;
  payment: string;
  installment: string;
};

export function TotemPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [brand, setBrand] = useState<TotemBrand | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const products = useMemo(() => {
    return TOTEM_PRODUCTS.filter((item) => {
      const brandOk = brand === 'all' || item.brand === brand;
      const searchOk =
        search.trim() === '' ||
        item.name.toLowerCase().includes(search.trim().toLowerCase());
      return brandOk && searchOk;
    });
  }, [brand, search]);

  function openProduct(product: TotemProduct) {
    setSelection({
      product,
      storage: product.storages[0],
      color: product.colors[0],
      fulfillment: FULFILLMENT_OPTIONS[0],
      payment: PAYMENT_OPTIONS[0],
      installment: INSTALLMENTS[0],
    });
    setError(null);
    setStep('configure');
  }

  function resetTotem() {
    setStep('welcome');
    setBrand('all');
    setSearch('');
    setSelection(null);
    setName('');
    setPhone('');
    setError(null);
    setSubmitting(false);
  }

  async function handleWhatsAppSubmit() {
    if (!selection) return;
    setError(null);
    setSubmitting(true);

    const priceLabel =
      selection.payment === 'À vista'
        ? formatBRL(selection.product.cashPrice)
        : `${selection.installment} · ${selection.product.installmentLabel}`;

    try {
      await submitTotemLead({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        productName: selection.product.name,
        color: selection.color,
        storage: selection.storage,
        fulfillment: selection.fulfillment,
        payment: selection.payment,
        installment: selection.payment === 'Parcelado' ? selection.installment : null,
        priceLabel,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o WhatsApp.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="totem">
      <header className="totem__top">
        <BrandLogo variant="mark" className="totem__mark" />
        <div className="totem__top-meta">
          <strong>Cell Ponto</strong>
          <span>Totem Marthi · WhatsApp via Evolution</span>
        </div>
        <Link to="/" className="totem__exit">
          Sair
        </Link>
      </header>

      {step === 'welcome' && (
        <section className="totem__welcome">
          <BrandLogo variant="hero" className="totem__welcome-logo" />
          <h1>Bem-vindo</h1>
          <p>Escolha seu aparelho em poucos toques. Sem fila, sem complicação.</p>
          <button type="button" className="totem-btn totem-btn--primary" onClick={() => setStep('catalog')}>
            Começar
          </button>
        </section>
      )}

      {step === 'catalog' && (
        <section className="totem__catalog">
          <div className="totem__toolbar">
            <input
              className="totem__search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar modelo…"
            />
            <div className="totem__brands">
              {TOTEM_BRANDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`totem-chip ${brand === item.id ? 'is-active' : ''}`}
                  onClick={() => setBrand(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="totem__grid">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                className="totem-card"
                onClick={() => openProduct(product)}
              >
                <ProductCarousel
                  images={product.images}
                  alt={product.name}
                  size="card"
                  className={`brand-${product.brand}`}
                />
                <div className="totem-card__body">
                  <h2>{product.name}</h2>
                  <p className="totem-card__price">{formatBRL(product.cashPrice)}</p>
                  <p className="totem-card__parc">{product.installmentLabel}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'configure' && selection && (
        <section className="totem__configure">
          <button type="button" className="totem-link" onClick={() => setStep('catalog')}>
            ← Voltar
          </button>

          <div className="totem__configure-layout">
            <ProductCarousel
              images={selection.product.images}
              alt={selection.product.name}
              size="hero"
              autoPlayMs={5000}
              className={`brand-${selection.product.brand}`}
            />

            <div className="totem__configure-panel">
              <h1>{selection.product.name}</h1>

              <label className="totem-field">
                Capacidade
                <select
                  value={selection.storage}
                  onChange={(e) => setSelection({ ...selection, storage: e.target.value })}
                >
                  {selection.product.storages.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="totem-field">
                Cor
                <select
                  value={selection.color}
                  onChange={(e) => setSelection({ ...selection, color: e.target.value })}
                >
                  {selection.product.colors.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label className="totem-field">
                Retirada
                <select
                  value={selection.fulfillment}
                  onChange={(e) => setSelection({ ...selection, fulfillment: e.target.value })}
                >
                  {FULFILLMENT_OPTIONS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div className="totem__prices">
                <div>
                  <span>À vista</span>
                  <strong>{formatBRL(selection.product.cashPrice)}</strong>
                </div>
                <div>
                  <span>Parcelado</span>
                  <strong>{selection.product.installmentLabel}</strong>
                </div>
              </div>

              <button
                type="button"
                className="totem-btn totem-btn--primary totem-btn--block"
                onClick={() => {
                  setError(null);
                  setStep('checkout');
                }}
              >
                Próximo
              </button>
            </div>
          </div>
        </section>
      )}

      {step === 'checkout' && selection && (
        <section className="totem__checkout">
          <button
            type="button"
            className="totem-link"
            onClick={() => setStep('configure')}
            disabled={submitting}
          >
            ← Voltar
          </button>

          <h1>{selection.product.name}</h1>
          <div className="totem__summary">
            <p>
              <span>Cor</span>
              <strong>{selection.color}</strong>
            </p>
            <p>
              <span>Capacidade</span>
              <strong>{selection.storage}</strong>
            </p>
            <p>
              <span>Retirada</span>
              <strong>{selection.fulfillment}</strong>
            </p>
          </div>

          {error && <p className="totem__error">{error}</p>}

          <label className="totem-field">
            Digite seu nome e sobrenome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              disabled={submitting}
            />
          </label>

          <label className="totem-field">
            Digite seu telefone com DDD
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(24) 99999-9999"
              inputMode="tel"
              disabled={submitting}
            />
          </label>

          <label className="totem-field">
            Modo de pagamento
            <select
              value={selection.payment}
              onChange={(e) => setSelection({ ...selection, payment: e.target.value })}
              disabled={submitting}
            >
              {PAYMENT_OPTIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          {selection.payment === 'Parcelado' && (
            <label className="totem-field">
              Parcelas
              <select
                value={selection.installment}
                onChange={(e) => setSelection({ ...selection, installment: e.target.value })}
                disabled={submitting}
              >
                {INSTALLMENTS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          )}

          <div className="totem__prices">
            <div>
              <span>Valor definido</span>
              <strong>
                {selection.payment === 'À vista'
                  ? formatBRL(selection.product.cashPrice)
                  : `${selection.installment} · ${selection.product.installmentLabel}`}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="totem-btn totem-btn--primary totem-btn--block"
            disabled={submitting || !name.trim() || phone.trim().length < 8}
            onClick={() => void handleWhatsAppSubmit()}
          >
            {submitting ? 'Enviando…' : 'Continuar no WhatsApp…'}
          </button>
        </section>
      )}

      {step === 'done' && selection && (
        <section className="totem__done">
          <h1>Pedido enviado</h1>
          <p>
            Obrigado, <strong>{name}</strong>! A loja recebeu seu interesse no{' '}
            <strong>{selection.product.name}</strong> ({selection.color} · {selection.storage}) via
            WhatsApp.
          </p>
          <p className="totem__done-note">Em breve alguém da equipe entrará em contato.</p>
          <button type="button" className="totem-btn totem-btn--primary" onClick={resetTotem}>
            Novo atendimento
          </button>
        </section>
      )}
    </div>
  );
}
