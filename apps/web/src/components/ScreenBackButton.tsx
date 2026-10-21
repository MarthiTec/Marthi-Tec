import { useLocation, useNavigate } from 'react-router-dom';
import './moduleChrome.css';

/** Índice da pilha do React Router (quando disponível). */
function historyIndex(): number {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' ? state.idx : -1;
}

/**
 * Voltar ao recurso anterior (histórico do router). Se não houver histórico in-app,
 * cai no `home` do módulo (ex.: /erp, /painel).
 */
export function ScreenBackButton({
  home,
  label = 'Voltar',
  className = '',
}: {
  home: string;
  label?: string;
  className?: string;
  /** @deprecated Sempre mostra ← Voltar (padrão Entrada de estoque). */
  iconOnly?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const atHome =
    (location.pathname === home || location.pathname === `${home}/`) && !location.search;

  if (atHome) return null;

  function goBack() {
    const idx = historyIndex();
    if (idx > 0) {
      navigate(-1);
      return;
    }
    navigate(home);
  }

  return (
    <button
      type="button"
      className={`screen-back ${className}`.trim()}
      onClick={goBack}
      title={label}
      aria-label={label}
    >
      <span className="screen-back__arrow" aria-hidden="true">
        ←
      </span>
      <span className="screen-back__label">{label}</span>
    </button>
  );
}
