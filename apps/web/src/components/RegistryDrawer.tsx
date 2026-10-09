import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InlineHeadingActions } from './PageHeadingActions';
import './registryDrawer.css';

/**
 * Abre um cadastro inteiro (kit, almoxarifado, lote…) por cima da tela atual, sem perder o que
 * já foi preenchido nela. Esc ou "Voltar ao produto" fecham.
 */
export function RegistryDrawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="registry-drawer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="registry-drawer__panel" role="dialog" aria-modal="true" aria-label={title}>
        <header className="registry-drawer__head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ← Voltar ao produto
          </button>
        </header>
        <div className="registry-drawer__body">
          <InlineHeadingActions.Provider value={true}>{children}</InlineHeadingActions.Provider>
        </div>
      </section>
    </div>,
    document.querySelector('.erp-app, .admin') ?? document.body,
  );
}
