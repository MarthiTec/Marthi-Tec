import { AdminPicker } from '../../components/AdminPicker';
import type { PaymentMethod } from '../../data/adminStore';
import {
  isCashPayment,
  isVoucherPayment,
  moneyBRL,
  paymentMaxInstallments,
  paymentShortLabel,
  roundMoney,
  suggestTenders,
  type SplitPayment,
  type SplitSummary,
} from './paymentSplit';
import './caixaPayments.css';

type CaixaPaymentSplitProps = {
  payments: PaymentMethod[];
  rows: SplitPayment[];
  summary: SplitSummary;
  onPatch: (key: string, patch: Partial<SplitPayment>, options?: { touch?: boolean }) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onOpenVale: () => void;
};

export function CaixaPaymentSplit({
  payments,
  rows,
  summary,
  onPatch,
  onAdd,
  onRemove,
  onOpenVale,
}: CaixaPaymentSplitProps) {
  const options = payments.map((item) => ({
    value: item.id,
    label: paymentShortLabel(item),
  }));
  const missing = summary.remaining > 0.005 ? summary.remaining : 0;
  const over = summary.remaining < -0.005 ? -summary.remaining : 0;

  return (
    <section className="pdv-split" aria-label="Formas de pagamento">
      <div className="pdv-split__head">
        <h3>Formas de pagamento</h3>
        <button
          type="button"
          className="pdv-split__add"
          onClick={onAdd}
          disabled={payments.length === 0}
          title="Dividir o pagamento em outra forma · Alt+P"
        >
          + Forma
          <kbd>Alt+P</kbd>
        </button>
      </div>

      <ul className="pdv-split__rows">
        {rows.map((row, index) => {
          const method = payments.find((item) => item.id === row.methodId);
          const cash = isCashPayment(method);
          const voucher = isVoucherPayment(method);
          const maxInstallments = paymentMaxInstallments(method);
          const tendered = row.tendered > 0 ? row.tendered : row.amount;
          const rowChange = cash ? roundMoney(Math.max(0, tendered - row.amount)) : 0;
          const rowShort = cash ? roundMoney(Math.max(0, row.amount - tendered)) : 0;
          const label = method ? paymentShortLabel(method) : 'Pagamento';

          return (
            <li key={row.key} className={`pdv-split__row${cash ? ' is-cash' : ''}`}>
              <div className={`pdv-split__main${rows.length > 1 ? ' is-multi' : ''}`}>
                <AdminPicker
                  label={index === 0 ? 'Pagamento' : `Forma ${index + 1}`}
                  value={row.methodId}
                  options={options}
                  onChange={(value) =>
                    onPatch(row.key, { methodId: value, installments: 1, tendered: 0 })
                  }
                />
                <label className="pdv-split__amount">
                  Valor
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={row.amount || ''}
                    aria-label={`Valor em ${label}`}
                    onChange={(event) =>
                      onPatch(
                        row.key,
                        // Mudou o valor da linha, o recebido anterior não vale mais.
                        { amount: Math.max(0, Number(event.target.value) || 0), tendered: 0 },
                        { touch: true },
                      )
                    }
                  />
                </label>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="pdv-split__drop"
                    aria-label={`Remover ${label}`}
                    title="Remover forma"
                    onClick={() => onRemove(row.key)}
                  >
                    ×
                  </button>
                ) : null}
              </div>

              {missing > 0 ? (
                <button
                  type="button"
                  className="pdv-split__rest"
                  onClick={() =>
                    onPatch(
                      row.key,
                      { amount: roundMoney(row.amount + missing), tendered: 0 },
                      { touch: true },
                    )
                  }
                >
                  Jogar o restante aqui ({moneyBRL(missing)})
                </button>
              ) : null}

              {voucher ? (
                <button type="button" className="pdv-split__vale" onClick={onOpenVale}>
                  Consultar / cadastrar vale
                </button>
              ) : null}

              {!voucher && maxInstallments > 1 ? (
                <AdminPicker
                  label="Parcelas"
                  className="pdv-split__installments"
                  value={String(Math.min(row.installments, maxInstallments))}
                  options={Array.from({ length: maxInstallments }, (_, position) => ({
                    value: String(position + 1),
                    label: `${position + 1}x`,
                  }))}
                  onChange={(value) => onPatch(row.key, { installments: Number(value) })}
                />
              ) : null}

              {cash ? (
                <div className="pdv-split__cash">
                  <label className="pdv-split__tender">
                    Recebido em dinheiro
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      placeholder={moneyBRL(row.amount)}
                      value={row.tendered || ''}
                      aria-label="Valor recebido em dinheiro"
                      onChange={(event) =>
                        onPatch(row.key, {
                          tendered: Math.max(0, Number(event.target.value) || 0),
                        })
                      }
                    />
                  </label>
                  {suggestTenders(row.amount).length > 0 ? (
                    <div className="pdv-split__notes" role="group" aria-label="Cédulas rápidas">
                      {suggestTenders(row.amount).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={row.tendered === value ? 'is-on' : ''}
                          onClick={() => onPatch(row.key, { tendered: value })}
                        >
                          {moneyBRL(value)}
                        </button>
                      ))}
                      {row.tendered > 0 ? (
                        <button type="button" onClick={() => onPatch(row.key, { tendered: 0 })}>
                          Valor exato
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {rowShort > 0 ? (
                    <p className="pdv-split__warn">
                      Faltam {moneyBRL(rowShort)} em dinheiro para cobrir esta forma.
                    </p>
                  ) : (
                    <p className={`pdv-split__change${rowChange > 0 ? ' is-on' : ''}`}>
                      Troco <strong>{moneyBRL(rowChange)}</strong>
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="pdv-split__status">
        <span>
          Lançado <strong>{moneyBRL(summary.allocated)}</strong>
        </span>
        {missing > 0 ? (
          <span className="is-warn">
            Falta <strong>{moneyBRL(missing)}</strong>
          </span>
        ) : over > 0 ? (
          <span className="is-warn">
            Excede <strong>{moneyBRL(over)}</strong>
          </span>
        ) : (
          <span className="is-ok">Pagamento fechado</span>
        )}
      </div>
    </section>
  );
}
