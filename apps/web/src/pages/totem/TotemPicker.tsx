import { useEffect, useId, useRef, useState } from 'react';

type TotemPickerProps = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function TotemPicker({ label, value, options, onChange, disabled = false }: TotemPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div className={`totem-picker ${open ? 'is-open' : ''}`} ref={rootRef}>
      <span className="totem-picker__caption">{label}</span>
      <button
        type="button"
        className="totem-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{value}</strong>
        <i aria-hidden="true" />
      </button>
      {open && (
        <ul className="totem-picker__menu" id={listId} role="listbox">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={option === value ? 'is-active' : ''}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span>{option}</span>
                {option === value ? <i className="totem-picker__check" aria-hidden="true" /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
