import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { screenForPath } from '../data/screenDirectory';
import { apiRecordScreenVisit } from '../services/screenVisitsApi';
import { isNestAuthed } from '../services/nestClient';

export const SCREEN_VISITED_EVENT = 'marthi-screen-visited';

/** Conta no banco cada tela do menu que a pessoa abre (alimenta as "Mais acessadas"). */
export function ScreenVisitTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const last = useRef('');

  useEffect(() => {
    if (!user || !isNestAuthed()) return;
    const screen = screenForPath(location.pathname);
    if (!screen || screen.path === last.current) return;
    last.current = screen.path;
    void apiRecordScreenVisit(screen.path)
      .then(() => window.dispatchEvent(new Event(SCREEN_VISITED_EVENT)))
      .catch(() => {
        /* contagem é só atalho: falha não atrapalha a tela */
      });
  }, [user, location.pathname]);

  return null;
}
