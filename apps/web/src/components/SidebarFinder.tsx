import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AdminIcon } from './AdminIcons';
import { SCREEN_VISITED_EVENT } from './ScreenVisitTracker';
import { SCREENS, screenForPath, searchScreens, type Screen } from '../data/screenDirectory';
import { apiTopScreens } from '../services/screenVisitsApi';
import './sidebarFinder.css';

/**
 * Topo da barra lateral: busca pelo menu ("onde quer ir?") e as 10 telas que a pessoa mais abre
 * (contadas no banco). Com algo digitado, a lista de módulos dá lugar aos resultados.
 */
export function SidebarFinder({
  query,
  onQuery,
  visible,
  collapsed,
  onExpand,
  onNavigate,
}: {
  query: string;
  onQuery: (value: string) => void;
  /** A pessoa pode abrir esta tela (plano, permissão, ramo da loja). */
  visible: (screen: Screen) => boolean;
  collapsed: boolean;
  onExpand: () => void;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const [topOpen, setTopOpen] = useState(false);
  const [top, setTop] = useState<Screen[] | null>(null);
  const [topError, setTopError] = useState('');

  const allowed = useMemo(() => SCREENS.filter(visible), [visible]);
  const results = useMemo(() => searchScreens(query, allowed), [query, allowed]);
  const current = screenForPath(location.pathname)?.path ?? '';

  useEffect(() => setActive(0), [query]);

  const loadTop = useCallback(async () => {
    try {
      const rows = await apiTopScreens(10);
      const byPath = new Map(allowed.map((screen) => [screen.path, screen]));
      setTop(rows.map((row) => byPath.get(row.path)).filter((screen): screen is Screen => Boolean(screen)));
      setTopError('');
    } catch (err) {
      setTopError(err instanceof Error ? err.message : 'Não foi possível carregar agora.');
    }
  }, [allowed]);

  useEffect(() => {
    if (!topOpen) return;
    void loadTop();
    const refresh = () => void loadTop();
    window.addEventListener(SCREEN_VISITED_EVENT, refresh);
    return () => window.removeEventListener(SCREEN_VISITED_EVENT, refresh);
  }, [topOpen, loadTop]);

  function go(screen: Screen) {
    onQuery('');
    onNavigate();
    navigate(screen.path);
  }

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === 'Escape') {
      onQuery('');
    }
  }

  if (collapsed) {
    return (
      <div className="sfinder sfinder--collapsed">
        <button
          type="button"
          className="admin__link"
          title="Buscar no menu"
          aria-label="Buscar no menu"
          onClick={() => {
            onExpand();
            window.setTimeout(() => input.current?.focus(), 60);
          }}
        >
          <AdminIcon name="search" />
        </button>
        <button
          type="button"
          className="admin__link"
          title="Mais acessadas"
          aria-label="Mais acessadas"
          onClick={() => {
            onExpand();
            setTopOpen(true);
          }}
        >
          <AdminIcon name="star" />
        </button>
      </div>
    );
  }

  return (
    <div className="sfinder">
      <label className="sfinder__search">
        <AdminIcon name="search" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Buscar no menu…"
          aria-label="Buscar tela no menu"
          aria-controls="sfinder-results"
          aria-activedescendant={results[active] ? `sfinder-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="go"
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKey}
        />
        {query ? (
          <button type="button" className="sfinder__clear" aria-label="Limpar busca" onClick={() => onQuery('')}>
            ×
          </button>
        ) : null}
      </label>

      {query.trim() ? (
        <div className="sfinder__results" id="sfinder-results" role="listbox" aria-label="Telas encontradas">
          {results.length ? (
            results.map((screen, index) => (
              <button
                key={screen.path}
                id={`sfinder-${index}`}
                type="button"
                role="option"
                aria-selected={index === active}
                className={`sfinder__item${index === active ? ' is-active' : ''}${screen.path === current ? ' is-current' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(screen)}
              >
                <AdminIcon name={screen.icon} />
                <span>
                  <strong>{screen.label}</strong>
                  <small>{screen.openApp ? `${screen.group} · abre o app` : screen.group}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="sfinder__empty">Nenhuma tela com “{query.trim()}”. Tente outra palavra, como estoque, venda ou nota.</p>
          )}
        </div>
      ) : (
        <div className={`admin__group sfinder__top${topOpen ? ' is-open' : ''}`}>
          <button type="button" className="admin__group-toggle" aria-expanded={topOpen} onClick={() => setTopOpen((open) => !open)}>
            <span className="admin__group-main">
              <AdminIcon name="star" />
              <span className="admin__link-label">Mais acessadas</span>
            </span>
            <span className="admin__group-meta">
              <i aria-hidden="true">{topOpen ? '▾' : '▸'}</i>
            </span>
          </button>
          {topOpen ? (
            <div className="admin__sub">
              {topError ? <p className="sfinder__empty">{topError}</p> : null}
              {!topError && top === null ? <p className="sfinder__empty">Carregando…</p> : null}
              {!topError && top && !top.length ? <p className="sfinder__empty">As telas que você mais abrir vão aparecer aqui.</p> : null}
              {top?.map((screen, index) => (
                <button
                  key={screen.path}
                  type="button"
                  className={`admin__sub-link sfinder__top-link${screen.path === current ? ' is-active' : ''}`}
                  onClick={() => go(screen)}
                >
                  <span className="sfinder__rank">{index + 1}</span>
                  <span className="sfinder__top-label">
                    {screen.label}
                    {screen.groupId !== 'home' && screen.group !== 'Atalhos' ? <small>{screen.group}</small> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
