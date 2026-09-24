import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HEADING_SLOT_ID = 'panel-page-actions';

/** Injeta ações no canto direito do título da página (ERP / Painel). */
export function PageHeadingActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById(HEADING_SLOT_ID));
  }, []);

  const body = <div className="page-heading-actions">{children}</div>;
  if (!slot) return body;
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

/** Botão Cancelar / Fechar com ícone. */
export function HeadingCancelButton({
  onClick,
  disabled,
  label = 'Cancelar',
}: HeadingBtnProps) {
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
