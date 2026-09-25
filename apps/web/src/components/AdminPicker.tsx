import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

export type AdminPickerOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  disabled?: boolean;
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
  /** Força ou desativa o campo de busca (padrão: auto ativado se > 7 itens). */
  searchable?: boolean;
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
  searchable,
}: AdminPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const items = useMemo(() => normalizeOptions(options), [options]);
  const selected = items.find((item) => item.value === value);
  const showCaption = Boolean(label) && !compact;

  const shouldSearch = searchable ?? items.length > 7;

  const filteredItems = useMemo(() => {
    if (!shouldSearch || !search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.hint && opt.hint.toLowerCase().includes(q)),
    );
  }, [items, search, shouldSearch]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }

    if (shouldSearch) {
      // Pequeno timeout para dar foco no input de busca ao abrir
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, shouldSearch]);

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
          {selected?.icon ? <span className="admin-picker__item-icon">{selected.icon}</span> : null}
          {selected?.label ?? placeholder}
        </span>
        <i aria-hidden="true" />
      </button>

      {open ? (
        <div className="admin-picker__dropdown">
          {shouldSearch ? (
            <div className="admin-picker__search-wrap">
              <input
                ref={searchInputRef}
                type="text"
                className="admin-picker__search"
                placeholder="Buscar opção..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredItems.length === 1) {
                    e.preventDefault();
                    onChange(filteredItems[0].value);
                    setOpen(false);
                  }
                }}
              />
              {search ? (
                <button
                  type="button"
                  className="admin-picker__search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Limpar busca"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ) : null}

          <ul className="admin-picker__menu" id={listId} role="listbox">
            {filteredItems.length === 0 ? (
              <li className="admin-picker__empty">Nenhum resultado encontrado</li>
            ) : (
              filteredItems.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    disabled={option.disabled}
                    className={`${option.value === value ? 'is-active' : ''} ${option.disabled ? 'is-disabled' : ''}`}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="admin-picker__option-text">
                      {option.icon ? <span className="admin-picker__item-icon">{option.icon}</span> : null}
                      <span>{option.label}</span>
                      {option.hint ? <small className="admin-picker__hint">{option.hint}</small> : null}
                    </span>
                    {option.value === value ? (
                      <i className="admin-picker__check" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
