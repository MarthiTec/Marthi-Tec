import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './catalogSelect.css';

export type CatalogSelectOption = { value: string; label: string };

/**
 * Combo do catálogo (Ordenar, Marca, Bateria) no padrão do Marthi: pílula com a opção escolhida e
 * lista arredondada com a cor da loja — no computador abre embaixo do botão, no celular sobe de baixo.
 */
export function CatalogSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: CatalogSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const accent = getComputedStyle(trigger.current).getPropertyValue('--cat-accent').trim() || '#e4572e';
    const sheet = window.innerWidth < 620;
    setPlace(
      sheet
        ? ({ '--cat-accent': accent } as CSSProperties)
        : ({ '--cat-accent': accent, top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 232), minWidth: Math.max(rect.width, 200) } as CSSProperties),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.setTimeout(() => list.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, options, value]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      if (options[active]) pick(options[active].value);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`catalog-select${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKey}
      >
        <span className="catalog-select__label">{label}</span>
        <strong>{selected?.label}</strong>
        <svg className="catalog-select__chev" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && place
        ? createPortal(
            <>
              <div className="catalog-select__scrim" onClick={() => setOpen(false)} />
              <ul
                ref={list}
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-label={label}
                aria-activedescendant={`${listId}-${active}`}
                className="catalog-select__list"
                style={place}
                onKeyDown={onKey}
              >
                <li className="catalog-select__title" aria-hidden="true">
                  {label}
                </li>
                {options.map((option, index) => (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={option.value === value}
                    className={`${option.value === value ? 'is-selected' : ''}${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(option.value)}
                  >
                    {option.label}
                    {option.value === value ? <span aria-hidden="true">✓</span> : null}
                  </li>
                ))}
              </ul>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
