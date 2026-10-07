import { useEffect, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ChangeEvent } from 'react';

export function parseCurrencyInput(raw: string, decimals = 2): number {
  if (!raw) return 0;
  let clean = raw.replace(/[^\d.,]/g, '').trim();
  if (!clean) return 0;

  if (clean.includes(',') && clean.includes('.')) {
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    if (lastComma > lastDot) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean) && decimals < 3) {
    // "1.500" digitado no padrão brasileiro é mil e quinhentos, não 1,5.
    clean = clean.replace(/\./g, '');
  }
  const num = Number.parseFloat(clean);
  const factor = 10 ** decimals;
  return Number.isFinite(num) ? Math.max(0, Math.round(num * factor) / factor) : 0;
}

export function formatCurrencyDisplay(val: number, decimals = 2): string {
  if (!Number.isFinite(val) || val <= 0) return decimals ? `0,${'0'.repeat(decimals)}` : '0';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export type CurrencyInputProps = {
  value: number;
  onChange: (val: number) => void;
  /** Casas decimais exibidas e aceitas (2 para dinheiro e taxas, 3 para KG, 0 para unidades). */
  decimals?: number;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

export function CurrencyInput({
  value,
  onChange,
  decimals = 2,
  placeholder,
  className,
  style,
  ariaLabel,
  title,
  disabled,
  autoFocus,
  onKeyDown,
}: CurrencyInputProps) {
  const format = (amount: number) => (amount > 0 ? formatCurrencyDisplay(amount, decimals) : '');
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState(() => format(value));

  useEffect(() => {
    if (!isFocused) {
      setRawText(format(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused, decimals]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nextText = e.target.value;
    setRawText(nextText);
    onChange(parseCurrencyInput(nextText, decimals));
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    setIsFocused(true);
    e.target.select();
  }

  function handleBlur() {
    setIsFocused(false);
    const parsed = parseCurrencyInput(rawText, decimals);
    onChange(parsed);
    setRawText(format(parsed));
  }

  const displayVal = isFocused ? rawText : value > 0 ? format(value) : rawText;

  return (
    <input
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      placeholder={placeholder ?? formatCurrencyDisplay(0, decimals)}
      className={className}
      style={style}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      autoFocus={autoFocus}
      value={displayVal}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
    />
  );
}
