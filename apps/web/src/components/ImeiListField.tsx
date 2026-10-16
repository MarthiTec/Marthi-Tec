import { useRef } from 'react';

/**
 * IMEIs da entrada, um campo por aparelho (com `secondary`, o 2º IMEI do aparelho dual chip ao lado). "+ IMEI" acrescenta outro (mesmo fornecedor e custo,
 * IMEI diferente); Enter no último campo também acrescenta — prático com leitor de código.
 */
export function ImeiListField({
  label,
  value,
  onChange,
  disabled,
  secondary,
}: {
  label: string;
  value: string[];
  onChange: (list: string[], secondary: string[]) => void;
  disabled?: boolean;
  /** 2º IMEI de cada aparelho dual chip (mesma posição da lista). Não conta como unidade. */
  secondary?: string[];
}) {
  const list = value.length ? value : [''];
  const seconds = list.map((_, index) => secondary?.[index] ?? '');
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const focusLater = (index: number) => requestAnimationFrame(() => refs.current[index]?.focus());

  const set = (index: number, text: string) => onChange(list.map((item, i) => (i === index ? text.replace(/\s+/g, '') : item)), seconds);
  const setSecond = (index: number, text: string) => onChange(list, seconds.map((item, i) => (i === index ? text.replace(/\s+/g, '') : item)));
  const add = () => {
    onChange([...list, ''], [...seconds, '']);
    focusLater(list.length);
  };
  const remove = (index: number) => {
    const next = list.filter((_, i) => i !== index);
    const nextSeconds = seconds.filter((_, i) => i !== index);
    onChange(next.length ? next : [''], next.length ? nextSeconds : ['']);
  };

  return (
    <div className="imei-list">
      <span className="imei-list__label">{label}</span>
      {list.map((imei, index) => (
        <div key={index} className="imei-list__row">
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={imei}
            inputMode="numeric"
            maxLength={20}
            disabled={disabled}
            placeholder={`IMEI ${index + 1}`}
            aria-label={`IMEI ${index + 1}`}
            onChange={(e) => set(index, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (index === list.length - 1 && imei.trim()) add();
                else focusLater(index + 1);
              }
            }}
          />
          {secondary ? (
            <input
              className="imei-list__second"
              value={seconds[index]}
              inputMode="numeric"
              maxLength={20}
              disabled={disabled || !imei}
              placeholder="2º IMEI (opcional)"
              aria-label={`2º IMEI do aparelho ${index + 1}`}
              title="Aparelho dual chip: o 2º IMEI fica guardado junto e não conta como outra unidade"
              onChange={(e) => setSecond(index, e.target.value)}
            />
          ) : null}
          {list.length > 1 || imei ? (
            <button type="button" className="imei-list__remove" disabled={disabled} aria-label={`Remover IMEI ${index + 1}`} title="Remover este IMEI" onClick={() => remove(index)}>
              ×
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="quick-add-btn imei-list__add" disabled={disabled} onClick={add}>
        ＋ IMEI
      </button>
    </div>
  );
}

/** IMEIs preenchidos (sem campos vazios). */
export const filledImeis = (list: string[]) => list.map((item) => item.trim()).filter(Boolean);
