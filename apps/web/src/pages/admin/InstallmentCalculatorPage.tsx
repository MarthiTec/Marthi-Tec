import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { hydrateCardMachinesFromApi } from '../../data/cardRatesStore';
import { MAX_CALCULATOR_INSTALLMENTS, simulateInstallments } from '../../data/installmentCalculator';
import { getActiveStoreId, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { hydrateTotemSettingsFromApi } from '../../data/totemSettings';
import { totemCardFee } from '../../data/variantQuote';
import './installmentCalculator.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const PARCELS = Array.from({ length: MAX_CALCULATOR_INSTALLMENTS }, (_, index) => index + 1);

/**
 * Calculadora de parcelamento (PDV): valor à vista e parcelas → taxa, total com juros e parcela.
 * As taxas são as da maquininha da loja (Taxas & Maquininhas), as mesmas da venda e do totem.
 */
export function InstallmentCalculatorPage() {
  const [storeId, setStoreId] = useState(getActiveStoreId);
  const [ratesReady, setRatesReady] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const [price, setPrice] = useState(0);
  const [parcels, setParcels] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const changed = () => setStoreId(getActiveStoreId());
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, []);

  useEffect(() => {
    let alive = true;
    setRatesReady(false);
    setRatesError('');
    void Promise.allSettled([hydrateCardMachinesFromApi(), hydrateTotemSettingsFromApi()]).then((results) => {
      if (!alive) return;
      if (results.every((result) => result.status === 'rejected')) setRatesError('Não foi possível carregar as taxas da loja.');
      setRatesReady(true);
    });
    return () => {
      alive = false;
    };
  }, [storeId]);

  // Taxa de cada quantidade de parcelas (1x a 18x), lida depois que as taxas da loja carregam.
  const rates = useMemo(() => (ratesReady ? PARCELS.map((count) => Math.max(0, Number(totemCardFee(count)) || 0)) : []), [ratesReady, storeId]);
  const hasRates = rates.some((rate) => rate > 0);
  const table = useMemo(() => PARCELS.map((count) => simulateInstallments(price, count, rates[count - 1] ?? 0)), [price, rates]);
  const current = table[parcels - 1];

  async function copySimulation() {
    const text = [
      `Valor à vista: ${money(price)}`,
      `${current.parcels}x de ${money(current.installment)} no cartão`,
      `Total no cartão: ${money(current.total)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="admin-page installment-calc">
      <header className="installment-calc__head">
        <h1>Calculadora de parcelamento</h1>
        <p>Digite o valor à vista e escolha as parcelas: a taxa vem da maquininha da loja e o total e a parcela saem arredondados para cima.</p>
      </header>

      {ratesError ? <p className="installment-calc__alert" role="alert">{ratesError}</p> : null}
      {ratesReady && !ratesError && !hasRates ? (
        <p className="installment-calc__alert" role="status">
          Nenhuma taxa de cartão cadastrada. Cadastre em <Link to="/painel/taxas-cartao">Taxas & Maquininhas</Link>.
        </p>
      ) : null}

      <div className="installment-calc__layout">
        <section className="admin-card installment-calc__card" aria-label="Simulação">
          <div className="installment-calc__inputs">
            <label className="admin-field">
              Valor do aparelho (à vista)
              <CurrencyInput value={price} onChange={setPrice} ariaLabel="Valor à vista" />
            </label>
            <AdminPicker
              label="Quantidade de parcelas"
              value={String(parcels)}
              options={PARCELS.map((count) => ({ value: String(count), label: `${count}x` }))}
              onChange={(value) => setParcels(Number(value) || 1)}
            />
          </div>

          <dl className="installment-calc__result">
            <div>
              <dt>Taxa aplicada</dt>
              <dd>{ratesReady ? percent(current.ratePercent) : '…'}</dd>
            </div>
            <div className="installment-calc__highlight">
              <dt>Valor de cada parcela</dt>
              <dd>
                {current.parcels}x de {money(current.installment)}
              </dd>
            </div>
            <div>
              <dt>Valor total com juros</dt>
              <dd>{money(current.total)}</dd>
            </div>
            <div>
              <dt>Valor total de juros</dt>
              <dd>{money(current.interest)}</dd>
            </div>
          </dl>

          <button type="button" className="btn btn--ghost" disabled={!price} onClick={() => void copySimulation()}>
            {copied ? 'Copiado ✓' : 'Copiar simulação'}
          </button>
        </section>

        <section className="admin-card installment-calc__card" aria-label="Tabela de taxas">
          <h2>Tabela de parcelas</h2>
          <div className="installment-calc__table" role="table">
            <div className="installment-calc__row installment-calc__row--head" role="row">
              <span role="columnheader">Parcelas</span>
              <span role="columnheader">Taxa</span>
              <span role="columnheader">Parcela</span>
              <span role="columnheader">Total</span>
            </div>
            {table.map((row) => (
              <button
                key={row.parcels}
                type="button"
                role="row"
                className={`installment-calc__row${row.parcels === parcels ? ' is-selected' : ''}`}
                onClick={() => setParcels(row.parcels)}
              >
                <span role="cell">{row.parcels}x</span>
                <span role="cell">{ratesReady ? percent(row.ratePercent) : '…'}</span>
                <span role="cell">{money(row.installment)}</span>
                <span role="cell">{money(row.total)}</span>
              </button>
            ))}
          </div>
          <p className="installment-calc__note">
            Taxas de <Link to="/painel/taxas-cartao">Taxas & Maquininhas</Link>. Toque numa linha para simular.
          </p>
        </section>
      </div>
    </div>
  );
}
