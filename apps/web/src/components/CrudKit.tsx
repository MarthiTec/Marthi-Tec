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
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function CrudRowActions({ onView, onEdit, onDelete }: CrudRowActionsProps) {
  return (
    <div className="crud-actions">
      <button type="button" className="btn btn--ghost" onClick={onView}>
        Consultar
      </button>
      <button type="button" className="btn btn--ghost" onClick={onEdit}>
        Editar
      </button>
      <button type="button" className="btn btn--ghost crud-actions__danger" onClick={onDelete}>
        Excluir
      </button>
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
