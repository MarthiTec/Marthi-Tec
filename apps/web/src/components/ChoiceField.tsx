import { useEffect, useMemo, useRef, useState } from 'react';
import './choiceField.css';

export type Choice = { value: string; label: string; hint?: string };

/** Sem acento, minúsculo e só letras/números (busca "a12" acha "A12"; "13 pro" acha "IPHONE 13 PRO"). */
export const choiceText = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function filterChoices<T extends { label: string; hint?: string }>(choices: T[], term: string) {
  const words = choiceText(term).split(' ').filter(Boolean);
  if (!words.length) return choices;
  return choices.filter((choice) => {
    const text = choiceText(`${choice.label} ${choice.hint ?? ''}`);
    const compact = text.replace(/ /g, '');
    return words.every((word) => text.includes(word) || compact.includes(word));
  });
}

/**
 * Escolha única no padrão do Marthi (link do cliente): poucas opções = botões; muitas = lista com busca
 * (digitar, setas e Enter), que fecha ao escolher. Usa a cor da loja (--cat-accent).
 */
export function ChoiceField({
  choices,
  value,
  onChange,
  label,
  placeholder = 'Selecione',
  maxChips = 8,
  noun = 'opções',
}: {
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Até quantas opções aparecem como botões. */
  maxChips?: number;
  /** "modelos", "marcas", "vendedores"… (texto da busca). */
  noun?: string;
}) {
  if (choices.length <= maxChips) {
    return (
      <div className="choice-chips" role="radiogroup" aria-label={label}>
        {choices.map((choice) => (
          <button key={choice.value} type="button" role="radio" aria-checked={value === choice.value} className={value === choice.value ? 'is-on' : ''} onClick={() => onChange(choice.value)}>
            {choice.label}
          </button>
        ))}
      </div>
    );
  }
  return <ChoiceCombo choices={choices} value={value} onChange={onChange} label={label} placeholder={placeholder} noun={noun} />;
}

function ChoiceCombo({ choices, value, onChange, label, placeholder, noun }: { choices: Choice[]; value: string; onChange: (value: string) => void; label: string; placeholder: string; noun: string }) {
  const selected = choices.find((choice) => choice.value === value);
  const [open, setOpen] = useState(!selected);
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => filterChoices(choices, term), [choices, term]);

  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => input.current?.focus({ preventScroll: true }), 30);
    const outside = (event: MouseEvent) => {
      if (selected && box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open, selected]);

  function pick(next: string) {
    onChange(next);
    setTerm('');
    setOpen(false);
  }

  return (
    <div className={`choice-combo${open ? ' is-open' : ''}`} ref={box}>
      <button type="button" className="choice-combo__btn" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((current) => !current)}>
        <span className={selected ? '' : 'is-placeholder'}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open ? (
        <div className="choice-combo__panel">
          <input
            ref={input}
            type="search"
            value={term}
            placeholder={`Buscar entre ${choices.length} ${noun}…`}
            aria-label={`Buscar ${label.toLowerCase()}`}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, list.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter' && list[active]) {
                event.preventDefault();
                pick(list[active].value);
              } else if (event.key === 'Escape' && selected) setOpen(false);
            }}
          />
          <ul role="listbox" aria-label={label}>
            {list.map((choice, index) => (
              <li
                key={choice.value}
                role="option"
                aria-selected={choice.value === value}
                className={`${choice.value === value ? 'is-on' : ''}${index === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(choice.value)}
              >
                <span>
                  {choice.label}
                  {choice.hint ? <small>{choice.hint}</small> : null}
                </span>
                {choice.value === value ? <b aria-hidden>✓</b> : null}
              </li>
            ))}
            {!list.length ? <li className="choice-combo__empty">Nada encontrado com “{term.trim()}”.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
