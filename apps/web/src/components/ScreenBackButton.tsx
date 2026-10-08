import { useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from './AdminIcons';
import './moduleChrome.css';

export function ScreenBackButton({
  home,
  label = 'Voltar',
  className = '',
  iconOnly = false,
}: {
  home: string;
  label?: string;
  className?: string;
  /** Só a casinha (início do painel), sem texto. */
  iconOnly?: boolean;
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
      className={`screen-back${iconOnly ? ' screen-back--home' : ''} ${className}`.trim()}
      onClick={goBack}
      title={`Voltar para ${label}`}
      aria-label={`Voltar para ${label}`}
    >
      {iconOnly ? (
        <AdminIcon name="home" />
      ) : (
        <>
          <span className="screen-back__arrow" aria-hidden="true">←</span>
          <span className="screen-back__label">{label}</span>
        </>
      )}
    </button>
  );
}
