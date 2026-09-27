import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getActiveStore,
  listStores,
  setActiveStoreId,
  STORE_CONTEXT_CHANGED_EVENT,
  MULTI_STORE_CHANGED_EVENT,
  type Store,
} from '../data/multiStoreStore';
import './storeSwitcher.css';

export function StoreSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stores, setStores] = useState<Store[]>(() => listStores());
  const [activeStore, setActiveStore] = useState<Store | null>(() => getActiveStore());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function refresh() {
      setStores(listStores());
      setActiveStore(getActiveStore());
    }

    window.addEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  function handleSelect(storeId: string) {
    setActiveStoreId(storeId);
    setOpen(false);
  }

  if (!activeStore) {
    return null;
  }

  return (
    <div className="store-switcher" ref={menuRef}>
      <button
        type="button"
        className={`store-switcher__btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title="Alternar Loja / Contexto Operacional"
        aria-expanded={open}
      >
        <span className="store-switcher__icon" aria-hidden>🏢</span>
        <div className="store-switcher__info">
          <span className="store-switcher__name">{activeStore.name}</span>
          <span className="store-switcher__meta">
            {activeStore.isMatrix ? 'Matriz' : 'Filial'} · {activeStore.cnpj}
          </span>
        </div>
        <span className="store-switcher__chevron" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="store-switcher__dropdown" role="menu">
          <div className="store-switcher__header">
            <strong>Lojas Autorizadas</strong>
            <span className="store-switcher__count">{stores.filter((s) => s.active).length} ativas</span>
          </div>

          <div className="store-switcher__list">
            {stores.map((s) => {
              const isSelected = s.id === activeStore.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  className={`store-switcher__item ${isSelected ? 'is-selected' : ''} ${!s.active ? 'is-inactive' : ''}`}
                  onClick={() => handleSelect(s.id)}
                  disabled={!s.active}
                >
                  <div className="store-switcher__item-top">
                    <span className="store-switcher__item-name">{s.name}</span>
                    {s.isMatrix && <span className="store-switcher__tag store-switcher__tag--matrix">Matriz</span>}
                    {isSelected && <span className="store-switcher__tag store-switcher__tag--active">Atual</span>}
                  </div>
                  <div className="store-switcher__item-sub">
                    <span>CNPJ: {s.cnpj}</span>
                    <span>{s.city} - {s.state}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="store-switcher__footer">
            <button
              type="button"
              className="store-switcher__manage-btn"
              onClick={() => {
                setOpen(false);
                navigate('/erp/lojas');
              }}
            >
              ⚙️ Gerenciar Lojas & Licenciamento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
