import { useLocation, useNavigate } from 'react-router-dom';
import './moduleChrome.css';

export function ScreenBackButton({
  home,
  label = 'Voltar',
  className = '',
}: {
  home: string;
  label?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const atHome =
    (location.pathname === home || location.pathname === `${home}/`) && !location.search;

  if (atHome) return null;

  function goBack() {
    navigate(home);
  }

  return (
    <button
      type="button"
      className={`screen-back ${className}`.trim()}
      onClick={goBack}
      title={`Voltar para ${label}`}
      aria-label={`Voltar para ${label}`}
    >
      <span className="screen-back__arrow" aria-hidden="true">←</span>
      <span className="screen-back__label">{label}</span>
    </button>
  );
}
