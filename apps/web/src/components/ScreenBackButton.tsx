import { useLocation, useNavigate } from 'react-router-dom';
import './moduleChrome.css';

/** Índice da pilha do React Router (quando disponível). */
function historyIndex(): number {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' ? state.idx : -1;
}

/**
 * Voltar discreto (padrão Catálogo Digital): squircle + seta ←.
 * Histórico do router quando existe; senão cai no `home` do módulo.
 */
export function ScreenBackButton({
  home,
  label = 'Voltar',
  className = '',
}: {
  home: string;
  label?: string;
  className?: string;
  /** @deprecated Sempre ícone discreto (seta); texto só em aria/title. */
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
    </button>
  );
}
