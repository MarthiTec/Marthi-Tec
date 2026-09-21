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
      <label className="crud-search">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label="Buscar"
        />
      </label>
      {status !== undefined && onStatusChange ? (
        <div className="crud-filter">
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
        </div>
      ) : null}
      {extra}
      {onNew ? (
        <button type="button" className="btn btn--primary" onClick={onNew}>
          + {newLabel}
        </button>
      ) : null}
    </div>
  );
}

type CrudRowActionsProps = {
  /** Preferir clique no nome (`CrudNameButton`) para visualizar. */
  onView?: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/** Ações compactas: Editar / Excluir. Visualizar fica no nome da linha. */
export function CrudRowActions({ onView, onEdit, onDelete }: CrudRowActionsProps) {
  return (
    <div className="crud-actions">
      {onView ? (
        <button type="button" className="btn btn--ghost crud-actions__view" onClick={onView}>
          Ver
        </button>
      ) : null}
      <button type="button" className="btn btn--ghost" onClick={onEdit}>
        Editar
      </button>
      <button type="button" className="btn btn--ghost crud-actions__danger" onClick={onDelete}>
        Excluir
      </button>
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
