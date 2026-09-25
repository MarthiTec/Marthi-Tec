import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { TeamUsersSection } from '../../components/TeamUsersSection';
import { AdminIcon, type AdminIconName } from '../../components/AdminIcons';
import { CrudIconButton } from '../../components/CrudKit';
import { PresenceStatusControl } from '../../components/PresenceStatusControl';
import { TeamPresenceBoard } from '../../components/TeamPresenceBoard';
import { StoreSegmentSettings } from '../../components/StoreSegmentSettings';
import {
  deleteOperationShortcut,
  listOperationShortcuts,
  OPERATION_COLOR_PRESETS,
  OPERATION_ICON_OPTIONS,
  OPERATIONS_EVENT,
  operationStatusColor,
  resetOperationShortcuts,
  setOperationActive,
  upsertOperationShortcut,
  type OperationShortcut,
} from '../../data/operationsStore';
import './operations.css';

type Draft = {
  id?: string;
  label: string;
  href: string;
  color: string;
  active: boolean;
  icon: AdminIconName;
};

const EMPTY_DRAFT: Draft = {
  label: '',
  href: '',
  color: '#0e7490',
  active: true,
  icon: 'ops',
};

type OpsTab = 'ramo' | 'atalhos' | 'usuarios';

/** Ramo da loja, atalhos configuráveis e equipe da operação. */
export function OperationsPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as OpsTab | null;

  const [tab, setTab] = useState<OpsTab>(() => {
    if (tabParam === 'ramo' || tabParam === 'atalhos' || tabParam === 'usuarios') return tabParam;
    if (location.pathname.endsWith('/usuarios')) return 'usuarios';
    return 'ramo';
  });

  const [items, setItems] = useState(() => listOperationShortcuts());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setItems(listOperationShortcuts());
    }
    window.addEventListener(OPERATIONS_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(OPERATIONS_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith('/usuarios')) {
      setTab('usuarios');
      const el = document.getElementById('usuarios-loja');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.pathname]);

  function switchTab(nextTab: OpsTab) {
    setTab(nextTab);
    setSearchParams({ tab: nextTab });
  }

  function openCreate() {
    setEditing(true);
    setDraft({ ...EMPTY_DRAFT });
    setMessage(null);
  }

  function openEdit(item: OperationShortcut) {
    setEditing(true);
    setDraft({
      id: item.id,
      label: item.label,
      href: item.href,
      color: item.color,
      active: item.active,
      icon: item.icon,
    });
    setMessage(null);
  }

  function cancelEdit() {
    setDraft(null);
    setEditing(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const label = draft.label.trim();
    const href = draft.href.trim();
    if (!label || !href) {
      setMessage('Informe nome e link da operação.');
      return;
    }
    upsertOperationShortcut({
      id: draft.id,
      label,
      href,
      color: draft.color,
      active: draft.active,
      icon: draft.icon,
    });
    setItems(listOperationShortcuts());
    setMessage('Operação salva.');
    cancelEdit();
  }

  function toggleActive(item: OperationShortcut) {
    setOperationActive(item.id, !item.active);
    setItems(listOperationShortcuts());
    setMessage(item.active ? 'Operação desativada.' : 'Operação ativada.');
  }

  function remove(item: OperationShortcut) {
    if (!window.confirm(`Remover "${item.label}"?`)) return;
    deleteOperationShortcut(item.id);
    setItems(listOperationShortcuts());
    setMessage('Operação removida.');
  }

  function resetDefaults() {
    if (!window.confirm('Restaurar atalhos padrão da loja?')) return;
    resetOperationShortcuts();
    setItems(listOperationShortcuts());
    setMessage('Atalhos restaurados.');
    cancelEdit();
  }

  return (
    <section className="admin-page ops-page">
      <div className="dash-hero">
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Configure o ramo do negócio, campos ativos, atalhos rápidos e a equipe de operação.
          </p>
          <h1 className="dash-hero__title">Operações & Configurações da Loja</h1>
        </div>

        {tab === 'atalhos' ? (
          <div className="dash-hero__launch">
            <div className="dash-hero__presence">
              <PresenceStatusControl />
            </div>
            <button type="button" className="btn btn--primary" onClick={openCreate}>
              <AdminIcon name="plus" />
              Nova operação
            </button>
            <button
              type="button"
              className={`btn btn--ghost ${editing ? 'is-active' : ''}`}
              onClick={() => setEditing((value) => !value)}
            >
              <AdminIcon name="settings" />
              {editing ? 'Concluir edição' : 'Editar atalhos'}
            </button>
          </div>
        ) : tab === 'usuarios' ? (
          <div className="dash-hero__launch">
            <div className="dash-hero__presence">
              <PresenceStatusControl />
            </div>
          </div>
        ) : null}
      </div>

      {/* Barra de Abas das Operações */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          borderBottom: '1px solid var(--line)',
          paddingBottom: 14,
          marginBottom: 8,
        }}
      >
        <button
          type="button"
          className={`btn ${tab === 'ramo' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => switchTab('ramo')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650 }}
        >
          <AdminIcon name="settings" />
          <span>Ramo da Loja & Personalização</span>
        </button>

        <button
          type="button"
          className={`btn ${tab === 'atalhos' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => switchTab('atalhos')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650 }}
        >
          <AdminIcon name="ops" />
          <span>Atalhos Operacionais</span>
        </button>

        <button
          type="button"
          className={`btn ${tab === 'usuarios' ? 'btn--primary' : 'btn--ghost'}`}
          onClick={() => switchTab('usuarios')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 650 }}
        >
          <AdminIcon name="people" />
          <span>Equipe & Usuários da Loja</span>
        </button>
      </div>

      {message ? <p className="ops-page__flash">{message}</p> : null}

      {/* ABA 1: Ramo da Loja & Personalização */}
      {tab === 'ramo' ? (
        <article className="admin-card">
          <StoreSegmentSettings
            title="Personalizações por Ramo de Atividade"
            lead="Clique no ramo da sua loja para aplicar as configurações recomendadas ou personalize campos como IMEI, senhas, mesas/cozinha e grade de moda."
            showSaveButton={true}
          />
        </article>
      ) : null}

      {/* ABA 2: Atalhos Operacionais */}
      {tab === 'atalhos' ? (
        <>
          {draft ? (
            <form className="admin-card ops-form" onSubmit={submit}>
              <header className="ops-form__head">
                <div>
                  <h2>{draft.id ? 'Editar operação' : 'Nova operação'}</h2>
                  <p>Verde = ativo · vermelho = inativo. A cor do botão é a sua escolha.</p>
                </div>
                <div className="ops-form__actions">
                  <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn--primary">
                    Salvar
                  </button>
                </div>
              </header>

              <div className="ops-form__grid">
                <label>
                  Nome da operação
                  <input
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    placeholder="Ex.: Totem balcão, TV cozinha"
                    required
                  />
                </label>
                <label>
                  Link interno ou URL externa
                  <input
                    value={draft.href}
                    onChange={(e) => setDraft({ ...draft, href: e.target.value })}
                    placeholder="/totem, /cozinha ou https://…"
                    required
                  />
                </label>
                <label>
                  Ícone
                  <select
                    value={draft.icon}
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value as AdminIconName })}
                  >
                    {OPERATION_ICON_OPTIONS.map((iconName) => (
                      <option key={iconName} value={iconName}>
                        {iconName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ops-form__status">
                  Status
                  <select
                    value={draft.active ? '1' : '0'}
                    onChange={(e) => setDraft({ ...draft, active: e.target.value === '1' })}
                  >
                    <option value="1">Ativo na central</option>
                    <option value="0">Inativo</option>
                  </select>
                </label>
              </div>

              <fieldset className="ops-colors">
                <legend>Cor do destaque</legend>
                <div className="ops-colors__row">
                  {OPERATION_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`ops-swatch ${draft.color.toLowerCase() === color.toLowerCase() ? 'is-active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setDraft({ ...draft, color })}
                      title={color}
                    />
                  ))}
                  <label className="ops-swatch ops-swatch--custom" title="Cor personalizada">
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>
            </form>
          ) : null}

          <article className="admin-card ops-board">
            <header className="ops-board__head">
              <div>
                <h2>Acesso rápido</h2>
                <p>
                  Ativo em verde · inativo em vermelho. Toque para abrir; em modo edição, altere ou remova.
                </p>
              </div>
              <button type="button" className="btn btn--ghost" onClick={resetDefaults}>
                Restaurar padrão
              </button>
            </header>

            {items.length === 0 ? (
              <p className="empty">Nenhuma operação ainda. Crie a primeira acima.</p>
            ) : (
              <ul className="ops-grid">
                {items.map((item) => {
                  const status = operationStatusColor(item.active);
                  const card = (
                    <>
                      <span className="ops-tile__icon" style={{ background: `${item.color}22`, color: item.color }}>
                        <AdminIcon name={item.icon} />
                      </span>
                      <span className="ops-tile__body">
                        <strong>{item.label}</strong>
                        <small>{item.href}</small>
                      </span>
                      <span className="ops-tile__status" style={{ background: status }} title={item.active ? 'Ativo' : 'Inativo'} />
                    </>
                  );

                  return (
                    <li key={item.id} className={`ops-tile ${item.active ? 'is-active' : 'is-inactive'}`}>
                      {editing ? (
                        <div className="ops-tile__panel" style={{ borderColor: `${item.color}55` }}>
                          {card}
                          <div className="ops-tile__edit crud-actions">
                            <CrudIconButton action="edit" onClick={() => openEdit(item)} />
                            <button type="button" className="btn btn--ghost" onClick={() => toggleActive(item)}>
                              {item.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <CrudIconButton action="delete" onClick={() => remove(item)} />
                          </div>
                        </div>
                      ) : item.active ? (
                        item.href.startsWith('http://') || item.href.startsWith('https://') ? (
                          <a
                            href={item.href}
                            className="ops-tile__link"
                            style={{ borderColor: `${item.color}66`, ['--ops-accent' as string]: item.color }}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {card}
                          </a>
                        ) : (
                          <Link
                            to={item.href}
                            className="ops-tile__link"
                            style={{ borderColor: `${item.color}66`, ['--ops-accent' as string]: item.color }}
                          >
                            {card}
                          </Link>
                        )
                      ) : (
                        <div
                          className="ops-tile__link is-disabled"
                          style={{ borderColor: `${status}44` }}
                          title="Operação inativa"
                        >
                          {card}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </>
      ) : null}

      {/* ABA 3: Equipe & Usuários da Loja */}
      {tab === 'usuarios' ? (
        <>
          <TeamPresenceBoard />
          <TeamUsersSection variant="operations" id="usuarios-loja" />
        </>
      ) : null}
    </section>
  );
}
