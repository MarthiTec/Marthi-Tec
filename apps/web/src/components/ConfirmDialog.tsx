import type { ReactNode } from 'react';
import './confirmDialog.css';

export type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Diálogo padrão “Tem certeza?” para ações destrutivas. */
export function ConfirmDialog({
  open,
  title = 'Tem certeza?',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const titleId = 'confirm-dialog-title';

  return (
    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="confirm-dialog__card">
        <h2 id={titleId}>{title}</h2>
        <div className="confirm-dialog__message">{message}</div>
        <div className="confirm-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
