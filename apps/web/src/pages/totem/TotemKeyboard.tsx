type TotemKeyboardProps = {
  onKey: (char: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onClear: () => void;
  onClose: () => void;
};

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
] as const;

export function TotemKeyboard({
  onKey,
  onBackspace,
  onSpace,
  onClear,
  onClose,
}: TotemKeyboardProps) {
  return (
    <div className="totem-kb" role="group" aria-label="Teclado virtual">
      <div className="totem-kb__rows">
        {ROWS.map((row) => (
          <div key={row.join('')} className="totem-kb__row">
            {row.map((key) => (
              <button
                key={key}
                type="button"
                className="totem-kb__key"
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
          <button type="button" className="totem-kb__key totem-kb__key--space" onClick={onSpace}>
            Espaço
          </button>
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
