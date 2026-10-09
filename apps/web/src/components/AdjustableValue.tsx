import { CurrencyInput } from './CurrencyInput';

/**
 * Valor calculado (ex.: quantidade e custo pelas entradas de fornecedor) que o usuário pode
 * destravar para ajustar à mão. Travado, mostra o valor e de onde ele vem.
 */
export function AdjustableValue({
  ariaLabel,
  value,
  display,
  hint,
  editing,
  disabled,
  decimals,
  onEdit,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  display: string;
  hint: string;
  editing: boolean;
  disabled?: boolean;
  decimals?: number;
  onEdit: () => void;
  onChange: (value: number) => void;
}) {
  if (editing && !disabled) {
    return <CurrencyInput ariaLabel={ariaLabel} decimals={decimals} value={value} onChange={onChange} />;
  }
  return (
    <span className="stock-qty-desc" aria-label={ariaLabel}>
      <span className="stock-qty-desc__text">
        <strong>{display}</strong>
        <small>{hint}</small>
      </span>
      {!disabled ? (
        <button type="button" className="stock-qty-desc__edit" title="Ajustar manualmente" aria-label={`Ajustar ${ariaLabel.toLowerCase()} manualmente`} onClick={onEdit}>
          ✎
        </button>
      ) : null}
    </span>
  );
}
