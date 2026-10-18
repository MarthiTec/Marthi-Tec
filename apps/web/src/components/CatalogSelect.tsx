import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { filterChoices } from './ChoiceField';
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
  const [term, setTerm] = useState('');
  const [place, setPlace] = useState<CSSProperties | null>(null);
  /** Muitas opções (ex.: várias marcas): a lista ganha busca. */
  const searchable = options.length > 8;
  const shown = searchable ? filterChoices(options, term) : options;
  const search = useRef<HTMLInputElement>(null);
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
    setTerm('');
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    };
    // Fecha ao rolar a página ou girar a tela — mas não ao rolar a própria lista nem quando o teclado
    // do celular abre (só a altura muda).
    const width = window.innerWidth;
    const onResize = () => window.innerWidth !== width && setOpen(false);
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && list.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    window.setTimeout(() => (searchable ? search.current : list.current)?.focus({ preventScroll: true }), 0);
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, options, value, searchable]);
  useEffect(() => setActive(0), [term]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((index) => Math.min(index + 1, shown.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if ((event.key === 'Enter' || (event.key === ' ' && !searchable)) && open) {
      event.preventDefault();
      if (shown[active]) pick(shown[active].value);
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
                {searchable ? (
                  <li className="catalog-select__search" role="presentation">
                    <input ref={search} type="search" value={term} placeholder={`Buscar ${label.toLowerCase()}…`} aria-label={`Buscar ${label.toLowerCase()}`} onChange={(event) => setTerm(event.target.value)} onKeyDown={onKey} />
                  </li>
                ) : null}
                {!shown.length ? <li className="catalog-select__empty">Nada encontrado.</li> : null}
                {shown.map((option, index) => (
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
