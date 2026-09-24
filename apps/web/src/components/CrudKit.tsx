import { AdminPicker } from './AdminPicker';
import type { ReactNode } from 'react';

export type CrudStatusFilter = 'all' | 'active' | 'inactive';

type CrudListBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  status?: CrudStatusFilter;
  onStatusChange?: (value: CrudStatusFilter) => void;
  statusLabel?: string;
  onNew?: () => void;
  newLabel?: string;
  extra?: ReactNode;
};

export function CrudListBar({
  query,
  onQueryChange,
  placeholder = 'Buscar…',
  status,
  onStatusChange,
  statusLabel = 'Situação',
  onNew,
  newLabel = 'Novo',
  extra,
}: CrudListBarProps) {
  return (
    <div className="admin-toolbar crud-bar">
      <label className="admin-field crud-search-field">
        Buscar
        <span className="crud-search">
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            aria-label="Buscar"
          />
        </span>
      </label>
      {status !== undefined && onStatusChange ? (
        <label className="admin-field crud-filter-field">
          {statusLabel}
          <AdminPicker
            compact
            label={statusLabel}
            value={status}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'active', label: 'Ativos' },
              { value: 'inactive', label: 'Inativos' },
            ]}
            onChange={(value) => onStatusChange(value as CrudStatusFilter)}
          />
        </label>
      ) : null}
      {extra}
      {onNew ? (
        <button type="button" className="btn btn--primary crud-bar__new" onClick={onNew}>
          + {newLabel}
        </button>
      ) : null}
    </div>
  );
}

type CrudActionKind = 'view' | 'edit' | 'duplicate' | 'delete';

const CRUD_ACTION_ICON: Record<CrudActionKind, { src: string; label: string }> = {
  view: { src: '/pdv/view.png', label: 'Visualizar' },
  edit: { src: '/pdv/edit.png', label: 'Editar' },
  duplicate: { src: '/pdv/duplicate.png', label: 'Duplicar' },
  delete: { src: '/pdv/trash.png', label: 'Excluir' },
};

type CrudIconButtonProps = {
  action: CrudActionKind;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
};

/** Botão de ação padronizado (olho / lápis / duplicar / lixeira). */
export function CrudIconButton({ action, onClick, disabled, title }: CrudIconButtonProps) {
  const meta = CRUD_ACTION_ICON[action];
  return (
    <button
      type="button"
      className={`btn btn--ghost btn--icon crud-ico-btn crud-ico-btn--${action}`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? meta.label}
      aria-label={title ?? meta.label}
    >
      <img src={meta.src} alt="" className="crud-ico-img" />
    </button>
  );
}

type CrudRowActionsProps = {
  onView?: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
};

/** Ações compactas: visualizar · editar · duplicar · excluir. */
export function CrudRowActions({ onView, onEdit, onDuplicate, onDelete }: CrudRowActionsProps) {
  return (
    <div className="crud-actions">
      {onView ? <CrudIconButton action="view" onClick={onView} /> : null}
      <CrudIconButton action="edit" onClick={onEdit} />
      {onDuplicate ? <CrudIconButton action="duplicate" onClick={onDuplicate} /> : null}
      <CrudIconButton action="delete" onClick={onDelete} />
    </div>
  );
}

/** Nome/título clicável — abre a visualização do registro. */
export function CrudNameButton({
  children,
  onClick,
  title = 'Clique para consultar',
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button type="button" className="admin-table__name-btn" onClick={onClick} title={title}>
      {children}
    </button>
  );
}

type CrudSelectionBarProps = {
  selectedCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  onToggleAllVisible: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  entityLabel?: string;
};

export function CrudSelectionBar({
  selectedCount,
  visibleCount,
  allVisibleSelected,
  onToggleAllVisible,
  onClear,
  onDeleteSelected,
  entityLabel = 'itens',
}: CrudSelectionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="crud-selection-bar" role="status">
      <span>
        <strong>{selectedCount}</strong> selecionado{selectedCount === 1 ? '' : 's'}
        {visibleCount ? ` · ${visibleCount} na lista` : ''}
      </span>
      <div className="crud-selection-bar__actions">
        <button type="button" className="btn btn--ghost" onClick={onToggleAllVisible}>
          {allVisibleSelected ? 'Desmarcar visíveis' : `Marcar os ${visibleCount} visíveis`}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClear}>
          Limpar seleção
        </button>
        <button type="button" className="btn btn--ghost crud-actions__danger" onClick={onDeleteSelected}>
          Excluir selecionados
        </button>
      </div>
      <span className="empty" style={{ margin: 0 }}>
        {entityLabel}
      </span>
    </div>
  );
}

export function crudFormTitle(mode: 'new' | 'edit' | 'view', entity: string) {
  if (mode === 'view') return `Consultar ${entity}`;
  if (mode === 'edit') return `Editar ${entity}`;
  return `Novo ${entity}`;
}

export function matchesQuery(haystack: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle);
}

export function matchesStatus(active: boolean, status: CrudStatusFilter) {
  if (status === 'all') return true;
  if (status === 'active') return active;
  return !active;
}

export function confirmDelete(label: string) {
  return window.confirm(`Excluir ${label}? Essa ação não pode ser desfeita.`);
}

export function confirmDeleteMany(count: number, entityLabel: string) {
  return window.confirm(
    `Excluir ${count} ${entityLabel}? Essa ação não pode ser desfeita.`,
  );
}

export function toggleIdInSet(ids: Set<string>, id: string) {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function setAllVisibleIds(ids: string[], selected: Set<string>, select: boolean) {
  const next = new Set(selected);
  for (const id of ids) {
    if (select) next.add(id);
    else next.delete(id);
  }
  return next;
}
