import { useEffect, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ChangeEvent } from 'react';

export function parseCurrencyInput(raw: string): number {
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
    clean = clean.replace(',', '.');
  }
  const num = Number.parseFloat(clean);
  return Number.isFinite(num) ? Math.max(0, Math.round(num * 100) / 100) : 0;
}

export function formatCurrencyDisplay(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0,00';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type CurrencyInputProps = {
  value: number;
  onChange: (val: number) => void;
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
  placeholder = '0,00',
  className,
  style,
  ariaLabel,
  title,
  disabled,
  autoFocus,
  onKeyDown,
}: CurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState(() => (value > 0 ? formatCurrencyDisplay(value) : ''));

  useEffect(() => {
    if (!isFocused) {
      setRawText(value > 0 ? formatCurrencyDisplay(value) : '');
    }
  }, [value, isFocused]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const nextText = e.target.value;
    setRawText(nextText);
    const parsed = parseCurrencyInput(nextText);
    onChange(parsed);
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    setIsFocused(true);
    e.target.select();
  }

  function handleBlur() {
    setIsFocused(false);
    const parsed = parseCurrencyInput(rawText);
    onChange(parsed);
    setRawText(parsed > 0 ? formatCurrencyDisplay(parsed) : '');
  }

  const displayVal = isFocused ? rawText : value > 0 ? formatCurrencyDisplay(value) : rawText;

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
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
