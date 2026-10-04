import './suggestionChips.css';

type Props = {
  title: string;
  hint?: string;
  values: string[];
  /** Valores já aplicados (ficam marcados). */
  selected?: string[];
  onPick: (value: string) => void;
  onPickAll?: () => void;
  disabled?: boolean;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function SuggestionChips({ title, hint, values, selected = [], onPick, onPickAll, disabled }: Props) {
  if (!values.length) return null;
  const pending = values.filter((v) => !selected.some((s) => same(s, v)));
  return (
    <div className="suggest-chips" role="group" aria-label={title}>
      <div className="suggest-chips__head">
        <span className="suggest-chips__title">✨ {title}</span>
        {onPickAll && pending.length > 1 ? (
          <button type="button" className="suggest-chips__all" onClick={onPickAll} disabled={disabled}>
            Usar todas ({pending.length})
          </button>
        ) : null}
      </div>
      {hint ? <p className="suggest-chips__hint">{hint}</p> : null}
      <div className="suggest-chips__list">
        {values.map((value) => {
          const active = selected.some((s) => same(s, value));
          return (
            <button
              key={value}
              type="button"
              className={`suggest-chip${active ? ' is-active' : ''}`}
              onClick={() => onPick(value)}
              disabled={disabled}
              aria-pressed={active}
              title={active ? `${value} já aplicado` : `Usar ${value}`}
            >
              {value}
              {active ? <span aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
