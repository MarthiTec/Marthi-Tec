import type { AdminIconName } from '../components/AdminIcons';

const STORAGE_KEY = 'marthi.operations.shortcuts.v1';
export const OPERATIONS_EVENT = 'marthi-operations-updated';

/** Ativo = verde fixo; inativo = vermelho fixo. */
export const OPERATION_STATUS_ACTIVE = '#16a34a';
export const OPERATION_STATUS_INACTIVE = '#dc2626';

export const OPERATION_COLOR_PRESETS = [
  '#0f766e',
  '#1d4ed8',
  '#b45309',
  '#7c3aed',
  '#db2777',
  '#0369a1',
  '#0e7490',
  '#ca8a04',
  '#334155',
] as const;

export type OperationShortcut = {
  id: string;
  label: string;
  href: string;
  /** Cor de destaque escolhida pelo usuário (botão/card). */
  color: string;
  /** Disponibilidade: verde ativo / vermelho inativo. */
  active: boolean;
  icon: AdminIconName;
  sortOrder: number;
};

const DEFAULT_OPS: OperationShortcut[] = [
  { id: 'pdv', label: 'Abrir PDV', href: '/caixa', color: '#1d4ed8', active: true, icon: 'cart', sortOrder: 10 },
  { id: 'mesa', label: 'Mesas / garçom', href: '/mesa', color: '#b45309', active: true, icon: 'ops', sortOrder: 15 },
  { id: 'cozinha', label: 'Tela da cozinha', href: '/cozinha', color: '#ca8a04', active: true, icon: 'ops', sortOrder: 16 },
  { id: 'erp', label: 'Abrir Retaguarda', href: '/erp', color: '#0e7490', active: true, icon: 'ops', sortOrder: 20 },
  { id: 'pdv-fila', label: 'Fila do totem', href: '/painel/pdv', color: '#1d4ed8', active: true, icon: 'cart', sortOrder: 30 },
  { id: 'vendas', label: 'Consultar vendas', href: '/painel/pedidos', color: '#334155', active: true, icon: 'search', sortOrder: 40 },
  { id: 'erp-visao', label: 'Visão Retaguarda', href: '/painel/erp', color: '#0e7490', active: true, icon: 'ops', sortOrder: 50 },
  { id: 'totem', label: 'Abrir Totem', href: '/totem', color: '#0f766e', active: true, icon: 'totem', sortOrder: 60 },
  { id: 'totem-dados', label: 'Dados do totem', href: '/painel/totem', color: '#0f766e', active: true, icon: 'totem', sortOrder: 70 },
  { id: 'os', label: 'Abrir oficina', href: '/os', color: '#b45309', active: true, icon: 'wrench', sortOrder: 80 },
  { id: 'os-visao', label: 'Visão OS', href: '/painel/os', color: '#b45309', active: true, icon: 'wrench', sortOrder: 90 },
  { id: 'os-agenda', label: 'Agenda', href: '/painel/os/agenda', color: '#b45309', active: true, icon: 'wrench', sortOrder: 100 },
  { id: 'fiscal', label: 'Abrir emissor', href: '/fiscal', color: '#7c3aed', active: true, icon: 'fiscal', sortOrder: 110 },
  { id: 'fiscal-visao', label: 'Visão fiscal', href: '/painel/fiscal', color: '#7c3aed', active: true, icon: 'fiscal', sortOrder: 120 },
  { id: 'notas', label: 'Notas emitidas', href: '/painel/notas', color: '#7c3aed', active: true, icon: 'fiscal', sortOrder: 130 },
  { id: 'ecom', label: 'Abrir e-commerce', href: '/ecommerce', color: '#db2777', active: true, icon: 'store', sortOrder: 140 },
  { id: 'ecom-visao', label: 'Visão e-commerce', href: '/painel/ecommerce', color: '#db2777', active: true, icon: 'store', sortOrder: 150 },
  { id: 'crm', label: 'Abrir CRM', href: '/crm', color: '#0369a1', active: true, icon: 'people', sortOrder: 160 },
  { id: 'crm-visao', label: 'Visão CRM', href: '/painel/crm', color: '#0369a1', active: true, icon: 'people', sortOrder: 170 },
  { id: 'plano', label: 'Plano', href: '/painel/plano', color: '#334155', active: true, icon: 'plan', sortOrder: 180 },
  { id: 'ajuda', label: 'Ajuda', href: '/painel/ajuda', color: '#334155', active: true, icon: 'help', sortOrder: 190 },
];

const ICONS: AdminIconName[] = [
  'home',
  'totem',
  'cart',
  'wrench',
  'people',
  'box',
  'fiscal',
  'store',
  'ops',
  'help',
  'plan',
  'search',
  'settings',
];

function uid() {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalize(item: Partial<OperationShortcut>, index: number): OperationShortcut | null {
  const label = String(item.label ?? '').trim();
  const href = String(item.href ?? '').trim();
  if (!label || !href) return null;
  const icon = ICONS.includes(item.icon as AdminIconName) ? (item.icon as AdminIconName) : 'ops';
  const color =
    typeof item.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.color.trim())
      ? item.color.trim()
      : '#0e7490';
  return {
    id: String(item.id || uid()),
    label,
    href,
    color,
    active: item.active !== false,
    icon,
    sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : (index + 1) * 10,
  };
}

function loadRaw(): OperationShortcut[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPS.map((item) => ({ ...item }));
    const parsed = JSON.parse(raw) as { items?: Partial<OperationShortcut>[] };
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return DEFAULT_OPS.map((item) => ({ ...item }));
    }
    return parsed.items
      .map((item, index) => normalize(item, index))
      .filter((item): item is OperationShortcut => Boolean(item))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
  } catch {
    return DEFAULT_OPS.map((item) => ({ ...item }));
  }
}

function save(items: OperationShortcut[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ items }));
  window.dispatchEvent(new Event(OPERATIONS_EVENT));
}

export function listOperationShortcuts() {
  const items = loadRaw();
  const missing = DEFAULT_OPS.filter((def) => !items.some((item) => item.id === def.id));
  if (!missing.length) return items;
  const merged = [...items, ...missing.map((item) => ({ ...item }))].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'),
  );
  save(merged);
  return merged;
}

export function operationStatusColor(active: boolean) {
  return active ? OPERATION_STATUS_ACTIVE : OPERATION_STATUS_INACTIVE;
}

export function upsertOperationShortcut(
  input: Omit<OperationShortcut, 'id' | 'sortOrder'> & { id?: string; sortOrder?: number },
) {
  const items = loadRaw();
  const id = input.id || uid();
  const idx = items.findIndex((item) => item.id === id);
  const next: OperationShortcut = {
    id,
    label: input.label.trim(),
    href: input.href.trim(),
    color: input.color,
    active: input.active,
    icon: input.icon,
    sortOrder: input.sortOrder ?? (idx >= 0 ? items[idx].sortOrder : (items.length + 1) * 10),
  };
  if (idx >= 0) items[idx] = next;
  else items.push(next);
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
  save(items);
  return next;
}

export function setOperationActive(id: string, active: boolean) {
  const items = loadRaw();
  const idx = items.findIndex((item) => item.id === id);
  if (idx < 0) return null;
  items[idx] = { ...items[idx], active };
  save(items);
  return items[idx];
}

export function deleteOperationShortcut(id: string) {
  const items = loadRaw().filter((item) => item.id !== id);
  save(items);
}

export function resetOperationShortcuts() {
  save(DEFAULT_OPS.map((item) => ({ ...item })));
}

export const OPERATION_ICON_OPTIONS = ICONS;
