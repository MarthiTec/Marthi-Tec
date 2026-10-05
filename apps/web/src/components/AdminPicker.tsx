import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState<{style:CSSProperties;dark:boolean}|null>(null);
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

  useLayoutEffect(() => {
    if (!open || !rootRef.current?.closest('.admin-table-container')) {
      setFloating(null);
      return;
    }
    const root = rootRef.current;
    const place = () => {
      const rect = root.querySelector('button')!.getBoundingClientRect();
      const computed = getComputedStyle(root);
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const upward = below < 220 && above > below;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - 24);
      const style:CSSProperties = {position:'fixed',zIndex:1000,width,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),maxHeight:Math.max(80,Math.min(340,(upward?above:below)-12)),fontFamily:computed.fontFamily,fontSize:computed.fontSize,color:computed.color,...(upward?{bottom:window.innerHeight-rect.top+6}:{top:rect.bottom+6})};
      for (const name of ['--ink','--mute','--line','--card','--card-2','--surface','--accent','--accent-rgb','--teal','--red']) {
        const value = computed.getPropertyValue(name);
        if (value) (style as Record<string,unknown>)[name] = value;
      }
      setFloating({style,dark:Boolean(root.closest('.is-theme-dark,.admin--dark'))});
    };
    place();
    const closeOnScroll = (event:Event) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [open]);

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
      if (!rootRef.current?.contains(event.target as Node) && !dropdownRef.current?.contains(event.target as Node)) {
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

  const dropdown = (
        <div className="admin-picker__dropdown" ref={dropdownRef}>
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
  );

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

      {open && (floating ? createPortal(
        <div className={`admin-picker admin-picker--floating ${floating.dark?'is-theme-dark':''}`} style={floating.style}>
          {dropdown}
        </div>, rootRef.current?.closest('dialog') ?? document.body
      ) : dropdown)}
    </div>
  );
}
