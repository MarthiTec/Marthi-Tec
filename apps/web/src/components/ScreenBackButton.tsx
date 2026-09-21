import { useLocation, useNavigate } from 'react-router-dom';
import './moduleChrome.css';

export function ScreenBackButton({
  home,
  label = 'Voltar',
}: {
  home: string;
  label?: string;
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
    <button type="button" className="screen-back" onClick={goBack}>
      ← {label}
    </button>
  );
}
