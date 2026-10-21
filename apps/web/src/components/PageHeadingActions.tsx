import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './recordNav.css';

const HEADING_SLOT_ID = 'panel-page-actions';

/**
 * Tela aberta dentro de outra (ex.: cadastro de kit aberto no cadastro do produto): os botões
 * ficam na própria janela em vez de irem para o título da página de fundo.
 */
export const InlineHeadingActions = createContext(false);

/** Injeta ações no canto direito do título da página (ERP / Painel). */
export function PageHeadingActions({ children }: { children: ReactNode }) {
  const inline = useContext(InlineHeadingActions);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!inline) setSlot(document.getElementById(HEADING_SLOT_ID));
  }, [inline]);

  const body = <div className="page-heading-actions">{children}</div>;
  if (!slot || inline) return body;
  return createPortal(body, slot);
}

type HeadingBtnProps = {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
};

/** Botão Salvar com ícone de confirmação (+ atalho visual Ctrl+S). */
export function HeadingSaveButton({
  onClick,
  disabled,
  label = 'Salvar',
  showShortcut = true,
}: HeadingBtnProps & { showShortcut?: boolean }) {
  return (
    <button
      type="button"
      className="btn btn--primary page-heading-btn"
      onClick={onClick}
      disabled={disabled}
    >
      <img src="/pdv/confirm.png" alt="" className="page-heading-btn__ico page-heading-btn__ico--on-primary" />
      {label}
      {showShortcut ? <kbd className="page-heading-btn__kbd">Ctrl+S</kbd> : null}
    </button>
  );
}

/** Botão Cancelar (edição) ou Voltar discreto (consulta) no título. */
export function HeadingCancelButton({
  onClick,
  disabled,
  label = 'Cancelar',
}: HeadingBtnProps) {
  const isBack = label === 'Voltar' || label === 'Fechar';
  if (isBack) {
    return (
      <button
        type="button"
        className="page-heading-btn page-heading-btn--back"
        onClick={onClick}
        disabled={disabled}
        title="Voltar"
        aria-label="Voltar"
      >
        <span className="page-heading-btn__arrow" aria-hidden="true">
          ←
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn btn--ghost page-heading-btn"
      onClick={onClick}
      disabled={disabled}
    >
      <img src="/pdv/cancel.png" alt="" className="page-heading-btn__ico" />
      {label}
    </button>
  );
}

/** Botão Novo cadastro no título. */
export function HeadingNewButton({
  onClick,
  disabled,
  label = 'Novo',
}: HeadingBtnProps) {
  return (
    <button
      type="button"
      className="btn btn--primary page-heading-btn stock-new-btn"
      onClick={onClick}
      disabled={disabled}
    >
      <img src="/pdv/add.png" alt="" className="page-heading-btn__ico page-heading-btn__ico--on-primary" />
      {label}
    </button>
  );
}

/** Editar (texto + ícone de lápis). */
export function HeadingEditButton({ onClick, disabled, label = 'Editar' }: HeadingBtnProps) {
  return (
    <button
      type="button"
      className="btn btn--primary page-heading-btn"
      onClick={onClick}
      disabled={disabled}
    >
      <img src="/pdv/edit.png" alt="" className="page-heading-btn__ico page-heading-btn__ico--on-primary" />
      {label}
    </button>
  );
}

/**
 * Navegar entre os cadastros da lista sem fechar a ficha: primeiro, anterior, próximo e último,
 * na ordem (e com os filtros) da lista que está na tela. Só aparece consultando um item.
 */
export function HeadingRecordNav<T extends { id: string }>({
  items,
  currentId,
  onOpen,
}: {
  items: readonly T[];
  currentId: string | null | undefined;
  onOpen: (item: T) => void;
}) {
  const index = items.findIndex((item) => item.id === currentId);
  // Celular: o título não tem espaço; as setas vão para uma pílula flutuante embaixo da tela.
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const sync = () => setPhone(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  if (items.length < 2 || index < 0) return null;
  const go = (to: number) => {
    const target = items[Math.max(0, Math.min(items.length - 1, to))];
    if (target && target.id !== currentId) onOpen(target);
  };
  const first = index === 0;
  const last = index === items.length - 1;
  const nav = (
    <nav className={`record-nav${phone ? ' record-nav--floating' : ''}`} aria-label="Navegar entre os cadastros">
      <button type="button" disabled={first} onClick={() => go(0)} aria-label="Primeiro" title="Primeiro">
        <RecordNavIcon d="M17 6l-6 6 6 6M7 6v12" />
      </button>
      <button type="button" disabled={first} onClick={() => go(index - 1)} aria-label="Anterior" title="Anterior">
        <RecordNavIcon d="M15 6l-6 6 6 6" />
      </button>
      <span className="record-nav__count" aria-live="polite">
        {index + 1}
        <small>/{items.length}</small>
      </span>
      <button type="button" disabled={last} onClick={() => go(index + 1)} aria-label="Próximo" title="Próximo">
        <RecordNavIcon d="M9 6l6 6-6 6" />
      </button>
      <button type="button" disabled={last} onClick={() => go(items.length - 1)} aria-label="Último" title="Último">
        <RecordNavIcon d="M7 6l6 6-6 6M17 6v12" />
      </button>
    </nav>
  );
  return phone ? createPortal(nav, document.body) : nav;
}

function RecordNavIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
