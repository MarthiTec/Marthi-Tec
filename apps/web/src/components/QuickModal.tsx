import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './quickModal.css';

/**
 * Janela rápida por cima da tela atual: cadastrar algo sem sair do que se está fazendo
 * (fornecedor dentro do produto, cliente dentro da venda…). Esc ou clique fora fecham.
 */
export function QuickModal({
  title,
  subtitle,
  submitLabel = 'Salvar',
  busy = false,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  subtitle?: string;
  submitLabel?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}) {
  const titleId = useId();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    form.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    // Este formulário pode estar dentro de outro (ex.: cadastro de produto): não deixa o submit subir.
    event.stopPropagation();
    if (!busy) void onSubmit();
  }

  // Portal no body: a janela nunca fica dentro do formulário da página (form dentro de form).
  return createPortal(
    <div className="quick-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form ref={form} className="quick-modal__card" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit}>
        <header className="quick-modal__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="quick-modal__close" aria-label="Fechar" disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="quick-modal__body">{children}</div>
        {error ? (
          <p className="quick-modal__error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="quick-modal__foot">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Salvando…' : submitLabel}
          </button>
        </footer>
      </form>
    </div>,
    // Dentro do contêiner do painel para herdar as cores do tema claro/escuro.
    document.querySelector('.admin') ?? document.body,
  );
}

/** Botão "+ Novo" que fica ao lado de um seletor para abrir o cadastro rápido. */
export function QuickAddButton({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="quick-add-btn" disabled={disabled} onClick={onClick}>
      <span aria-hidden="true">＋</span>
      {label}
    </button>
  );
}
