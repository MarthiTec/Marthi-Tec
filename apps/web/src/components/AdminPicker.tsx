import { useEffect, useId, useRef, useState } from 'react';

export type AdminPickerOption = {
  value: string;
  label: string;
};

type AdminPickerProps = {
  label?: string;
  value: string;
  options: readonly AdminPickerOption[] | readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Esconde o caption e usa aria-label — ideal em toolbars. */
  compact?: boolean;
};

function normalizeOptions(
  options: readonly AdminPickerOption[] | readonly string[],
): AdminPickerOption[] {
  return options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
}

export function AdminPicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Selecionar',
  className = '',
  compact = false,
}: AdminPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const items = normalizeOptions(options);
  const selected = items.find((item) => item.value === value);
  const showCaption = Boolean(label) && !compact;

  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={`admin-picker ${compact ? 'admin-picker--compact' : ''} ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      ref={rootRef}
    >
      {showCaption ? <span className="admin-picker__caption">{label}</span> : null}
      <button
        type="button"
        className="admin-picker__trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`admin-picker__value${selected ? '' : ' is-placeholder'}`}>
          {selected?.label ?? placeholder}
        </span>
        <i aria-hidden="true" />
      </button>
      {open ? (
        <ul className="admin-picker__menu" id={listId} role="listbox">
          {items.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={option.value === value ? 'is-active' : ''}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.value === value ? (
                  <i className="admin-picker__check" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
