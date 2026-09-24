import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TeamUsersSection } from '../../components/TeamUsersSection';
import { AdminIcon, type AdminIconName } from '../../components/AdminIcons';
import { CrudIconButton } from '../../components/CrudKit';
import { PresenceStatusControl } from '../../components/PresenceStatusControl';
import { TeamPresenceBoard } from '../../components/TeamPresenceBoard';
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

/** Atalhos configuráveis + presença da equipe. */
export function OperationsPage() {
  const location = useLocation();
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
    if (!location.pathname.endsWith('/usuarios')) return;
    const el = document.getElementById('usuarios-loja');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.pathname]);

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
    setMessage(draft.id ? 'Operação atualizada.' : 'Operação criada.');
    setDraft(null);
    setEditing(false);
    setItems(listOperationShortcuts());
  }

  function toggleActive(item: OperationShortcut) {
    setOperationActive(item.id, !item.active);
    setItems(listOperationShortcuts());
  }

  function remove(item: OperationShortcut) {
    if (!window.confirm(`Remover “${item.label}”?`)) return;
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
            Monte seus atalhos, escolha a cor e acompanhe a equipe em cada módulo.
          </p>
          <h1 className="dash-hero__title">Operações</h1>
        </div>
        <div className="dash-hero__launch">
          <div className="dash-hero__presence">
            <PresenceStatusControl />
          </div>
          <Link to="/painel/operacoes/usuarios" className="btn btn--ghost">
            <AdminIcon name="people" />
            Usuários
          </Link>
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
            {editing ? 'Concluir edição' : 'Editar'}
          </button>
        </div>
      </div>

      {message ? <p className="ops-page__flash">{message}</p> : null}

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
              Nome
              <input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Ex.: Abrir PDV"
                required
              />
            </label>
            <label>
              Link / rota
              <input
                value={draft.href}
                onChange={(e) => setDraft({ ...draft, href: e.target.value })}
                placeholder="/caixa ou https://…"
                required
              />
            </label>
            <label>
              Ícone
              <select
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value as AdminIconName })}
              >
                {OPERATION_ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-form__status">
              Disponibilidade
              <button
                type="button"
                className={`ops-status-toggle ${draft.active ? 'is-on' : 'is-off'}`}
                onClick={() => setDraft({ ...draft, active: !draft.active })}
              >
                <i style={{ background: operationStatusColor(draft.active) }} />
                {draft.active ? 'Ativo' : 'Inativo'}
              </button>
            </label>
          </div>

          <fieldset className="ops-form__colors">
            <legend>Cor do atalho</legend>
            <div className="ops-form__swatches">
              {OPERATION_COLOR_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`ops-swatch ${draft.color.toLowerCase() === hex ? 'is-selected' : ''}`}
                  style={{ background: hex }}
                  aria-label={`Cor ${hex}`}
                  onClick={() => setDraft({ ...draft, color: hex })}
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

      <TeamPresenceBoard />

      <TeamUsersSection variant="operations" id="usuarios-loja" />
    </section>
  );
}
