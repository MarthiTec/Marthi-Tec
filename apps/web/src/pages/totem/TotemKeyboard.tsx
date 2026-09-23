type TotemKeyboardMode = 'full' | 'letters' | 'numeric';

type TotemKeyboardProps = {
  mode?: TotemKeyboardMode;
  onKey: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onClear: () => void;
  onClose: () => void;
};

const FULL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const LETTER_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

const NUMERIC_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['0'],
] as const;

export function TotemKeyboard({
  mode = 'full',
  onKey,
  onBackspace,
  onSpace,
  onClear,
  onClose,
}: TotemKeyboardProps) {
  const rows = mode === 'letters' ? LETTER_ROWS : mode === 'numeric' ? NUMERIC_ROWS : FULL_ROWS;
  const showSpace = mode !== 'numeric';
  const label =
    mode === 'letters' ? 'Teclado de letras' : mode === 'numeric' ? 'Teclado numérico' : 'Teclado virtual';

  return (
    <div className={`totem-kb totem-kb--${mode}`} role="group" aria-label={label}>
      <div className="totem-kb__rows">
        {rows.map((row) => (
          <div key={row.join('')} className="totem-kb__row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className={`totem-kb__key${mode === 'numeric' ? ' totem-kb__key--num' : ''}`}
                onClick={() => onKey(key)}
              >
                {key}
              </button>
            ))}
          </div>
        ))}
        <div className="totem-kb__row">
          <button type="button" className="totem-kb__key totem-kb__key--wide" onClick={onClear}>
            Limpar
          </button>
          {showSpace ? (
            <button type="button" className="totem-kb__key totem-kb__key--space" onClick={onSpace}>
              Espaço
            </button>
          ) : null}
          <button type="button" className="totem-kb__key totem-kb__key--wide" onClick={onBackspace}>
            ← Apagar
          </button>
          <button type="button" className="totem-kb__key totem-kb__key--done" onClick={onClose}>
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
