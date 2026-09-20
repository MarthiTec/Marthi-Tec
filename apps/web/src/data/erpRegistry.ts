import type { PartnerModuleId } from './catalog';

const STORAGE_KEY = 'marthi.erp.registry.v1';

/** Áreas finas do painel (além do módulo do plano). */
export type AccessArea =
  | 'totem'
  | 'pdv'
  | 'os'
  | 'erp_customers'
  | 'erp_stock'
  | 'erp_attrs'
  | 'erp_prices'
  | 'erp_payments'
  | 'erp_finance'
  | 'erp_sellers'
  | 'erp_suppliers'
  | 'erp_employees'
  | 'erp_audit'
  | 'erp_invoices'
  | 'erp_fiscal'
  | 'ecommerce'
  | 'erp_plan';

export const ACCESS_AREA_LABEL: Record<AccessArea, string> = {
  totem: 'Totem',
  pdv: 'PDV / pedidos',
  os: 'Ordens de serviço',
  erp_customers: 'Clientes',
  erp_stock: 'Produtos',
  erp_attrs: 'Atributos',
  erp_prices: 'Tabelas de preço',
  erp_payments: 'Formas de pagamento',
  erp_finance: 'Financeiro',
  erp_sellers: 'Vendedores',
  erp_suppliers: 'Fornecedores',
  erp_employees: 'Funcionários',
  erp_audit: 'Auditoria',
  erp_invoices: 'Notas entrada/saída',
  erp_fiscal: 'Fiscal (NCM/CFOP)',
  ecommerce: 'E-commerce',
  erp_plan: 'Plano da loja (admin)',
};

export const ALL_ACCESS_AREAS = Object.keys(ACCESS_AREA_LABEL) as AccessArea[];

export type EmployeeRole = 'admin' | 'manager' | 'operator' | 'seller';

export const EMPLOYEE_ROLE_LABEL: Record<EmployeeRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  seller: 'Vendedor',
};

export type Seller = {
  id: string;
  name: string;
  phone: string;
  email: string;
  document: string;
  commissionPercent: number;
  active: boolean;
  employeeId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = {
  id: string;
  name: string;
  tradeName: string;
  document: string;
  phone: string;
  email: string;
  city: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Employee = {
  id: string;
  name: string;
  phone: string;
  email: string;
  document: string;
  role: EmployeeRole;
  /** Se true, pode entrar no sistema (e-mail deve bater com o login). */
  isSystemUser: boolean;
  /** E-mail do usuário de login (normalizado). */
  userEmail: string;
  accessAreas: AccessArea[];
  active: boolean;
  sellerId?: string;
  createdAt: string;
  updatedAt: string;
};

type RegistryState = {
  sellers: Seller[];
  suppliers: Supplier[];
  employees: Employee[];
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function defaultAdminAreas(): AccessArea[] {
  return [...ALL_ACCESS_AREAS];
}

function seed(): RegistryState {
  const stamp = now();
  const adminId = uid('EMP');
  const sellerId = uid('VEN');
  return {
    employees: [
      {
        id: adminId,
        name: 'Administrador da loja',
        phone: '',
        email: '',
        document: '',
        role: 'admin',
        isSystemUser: true,
        userEmail: '',
        accessAreas: defaultAdminAreas(),
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid('EMP'),
        name: 'Ana Costa',
        phone: '(24) 99900-1111',
        email: 'ana@loja.local',
        document: '',
        role: 'operator',
        isSystemUser: false,
        userEmail: '',
        accessAreas: ['os', 'erp_stock', 'erp_customers'],
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    sellers: [
      {
        id: sellerId,
        name: 'Bruno Vendas',
        phone: '(24) 98800-2222',
        email: 'bruno@loja.local',
        document: '',
        commissionPercent: 2,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    suppliers: [
      {
        id: uid('FOR'),
        name: 'Distribuidora Celular Sul',
        tradeName: 'CelSul',
        document: '12.345.678/0001-90',
        phone: '(21) 3333-4444',
        email: 'compras@celsul.local',
        city: 'Rio de Janeiro',
        notes: 'Peças e aparelhos',
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  };
}

function load(): RegistryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seed();
      save(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<RegistryState>;
    return {
      sellers: Array.isArray(parsed.sellers) ? parsed.sellers : [],
      suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers : [],
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
    };
  } catch {
    const seeded = seed();
    save(seeded);
    return seeded;
  }
}

function save(state: RegistryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-erp-registry-updated'));
}

export function getErpRegistry() {
  return load();
}

export function listSellers(activeOnly = false) {
  const items = load().sellers.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listSuppliers(activeOnly = false) {
  const items = load().suppliers.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listEmployees(activeOnly = false) {
  const items = load().employees.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function getSeller(id: string) {
  return load().sellers.find((item) => item.id === id) ?? null;
}

export function getSupplier(id: string) {
  return load().suppliers.find((item) => item.id === id) ?? null;
}

export function getEmployee(id: string) {
  return load().employees.find((item) => item.id === id) ?? null;
}

export function upsertSeller(
  input: Omit<Seller, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
) {
  const state = load();
  const stamp = now();
  if (input.id) {
    state.sellers = state.sellers.map((item) =>
      item.id === input.id ? { ...item, ...input, id: item.id, updatedAt: stamp } : item,
    );
  } else {
    state.sellers = [
      {
        ...input,
        id: uid('VEN'),
        createdAt: stamp,
        updatedAt: stamp,
      },
      ...state.sellers,
    ];
  }
  save(state);
  return state;
}

export function upsertSupplier(
  input: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
) {
  const state = load();
  const stamp = now();
  if (input.id) {
    state.suppliers = state.suppliers.map((item) =>
      item.id === input.id ? { ...item, ...input, id: item.id, updatedAt: stamp } : item,
    );
  } else {
    state.suppliers = [
      {
        ...input,
        id: uid('FOR'),
        createdAt: stamp,
        updatedAt: stamp,
      },
      ...state.suppliers,
    ];
  }
  save(state);
  return state;
}

export function removeSeller(id: string) {
  const state = load();
  state.sellers = state.sellers.filter((item) => item.id !== id);
  save(state);
  return state;
}

export function removeSupplier(id: string) {
  const state = load();
  state.suppliers = state.suppliers.filter((item) => item.id !== id);
  save(state);
  return state;
}

export function removeEmployee(id: string) {
  const state = load();
  state.employees = state.employees.filter((item) => item.id !== id);
  save(state);
  return state;
}

export type EmployeeSaveResult =
  | { ok: true; state: RegistryState; employee: Employee }
  | { ok: false; error: string };

export function upsertEmployee(
  input: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): EmployeeSaveResult {
  const state = load();
  const stamp = now();
  const email = normalizeEmail(input.email);
  const userEmail = input.isSystemUser ? normalizeEmail(input.userEmail || input.email) : '';

  if (!input.name.trim()) return { ok: false, error: 'Informe o nome do funcionário.' };
  if (input.isSystemUser && !userEmail) {
    return { ok: false, error: 'Funcionário usuário precisa de e-mail de login.' };
  }

  if (input.isSystemUser && userEmail) {
    const clash = state.employees.find(
      (item) =>
        item.id !== input.id &&
        item.isSystemUser &&
        item.active &&
        normalizeEmail(item.userEmail) === userEmail,
    );
    if (clash) {
      return {
        ok: false,
        error: `E-mail de login já vinculado a ${clash.name}.`,
      };
    }
  }

  const areas =
    input.role === 'admin'
      ? defaultAdminAreas()
      : input.accessAreas.filter((area) => ALL_ACCESS_AREAS.includes(area));

  const payload: Employee = {
    id: input.id ?? uid('EMP'),
    name: input.name.trim(),
    phone: input.phone.trim(),
    email,
    document: input.document.trim(),
    role: input.role,
    isSystemUser: input.isSystemUser,
    userEmail,
    accessAreas: areas,
    active: input.active,
    sellerId: input.sellerId,
    createdAt: stamp,
    updatedAt: stamp,
  };

  if (input.id) {
    const current = state.employees.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Funcionário não encontrado.' };
    payload.createdAt = current.createdAt;
    state.employees = state.employees.map((item) => (item.id === input.id ? payload : item));
  } else {
    state.employees = [payload, ...state.employees];
  }

  save(state);
  return { ok: true, state, employee: payload };
}

/** Funcionário usuário ativo pelo e-mail de login. */
export function findEmployeeByUserEmail(email: string | null | undefined) {
  const key = normalizeEmail(email ?? '');
  if (!key) return null;
  return (
    load().employees.find(
      (item) =>
        item.active &&
        item.isSystemUser &&
        normalizeEmail(item.userEmail || item.email) === key,
    ) ?? null
  );
}

export function employeeHasArea(employee: Employee | null, area: AccessArea) {
  if (!employee) return true;
  if (!employee.active) return false;
  if (employee.role === 'admin') return true;
  return employee.accessAreas.includes(area);
}

export function pathToAccessArea(pathname: string): AccessArea | null {
  if (pathname.startsWith('/painel/totem')) return 'totem';
  if (pathname.startsWith('/painel/pdv') || pathname.startsWith('/painel/pedidos')) return 'pdv';
  if (pathname.startsWith('/painel/os') || pathname.startsWith('/os')) return 'os';
  if (pathname.startsWith('/painel/clientes')) return 'erp_customers';
  if (
    pathname.startsWith('/painel/produtos') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/kits') ||
    pathname.startsWith('/painel/lotes') ||
    pathname.startsWith('/painel/almoxarifado')
  ) {
    return 'erp_stock';
  }
  if (pathname.startsWith('/painel/atributos')) return 'erp_attrs';
  if (pathname.startsWith('/painel/tabelas')) return 'erp_prices';
  if (pathname.startsWith('/painel/pagamentos')) return 'erp_payments';
  if (pathname.startsWith('/painel/financeiro')) return 'erp_finance';
  if (pathname.startsWith('/painel/vendedores')) return 'erp_sellers';
  if (pathname.startsWith('/painel/fornecedores')) return 'erp_suppliers';
  if (pathname.startsWith('/painel/funcionarios') || pathname.startsWith('/painel/permissoes')) {
    return 'erp_employees';
  }
  if (pathname.startsWith('/painel/auditoria')) return 'erp_audit';
  if (pathname.startsWith('/painel/notas') || pathname.startsWith('/fiscal/nfe')) return 'erp_invoices';
  if (
    pathname.startsWith('/fiscal') ||
    pathname.startsWith('/painel/fiscal') ||
    pathname.startsWith('/painel/classificacao-fiscal') ||
    pathname.startsWith('/painel/cfop')
  ) {
    return 'erp_fiscal';
  }
  if (pathname.startsWith('/ecommerce')) return 'ecommerce';
  if (pathname.startsWith('/painel/plano')) return 'erp_plan';
  return null;
}

function linkedSystemUsers() {
  return load().employees.filter(
    (item) => item.active && item.isSystemUser && normalizeEmail(item.userEmail || item.email),
  );
}

/**
 * ACL por funcionário-usuário.
 * - Sem nenhum usuário vinculado no cadastro → loja aberta (bootstrap).
 * - Login vinculado a funcionário → usa áreas / admin.
 * - Login sem vínculo, mas já existem usuários → bloqueia áreas de negócio.
 */
export function userCanAccessArea(userEmail: string | null | undefined, area: AccessArea) {
  const employee = findEmployeeByUserEmail(userEmail);
  if (employee) return employeeHasArea(employee, area);
  if (linkedSystemUsers().length === 0) return true;
  return false;
}

export function canAccessPath(pathname: string, userEmail: string | null | undefined) {
  const area = pathToAccessArea(pathname);
  if (!area) return true;
  return userCanAccessArea(userEmail, area);
}

export function moduleAreas(module: PartnerModuleId): AccessArea[] {
  if (module === 'totem') return ['totem'];
  if (module === 'os') return ['os'];
  if (module === 'fiscal') return ['erp_invoices', 'erp_fiscal'];
  if (module === 'ecommerce') return ['ecommerce'];
  if (module === 'erp') {
    return [
      'pdv',
      'erp_customers',
      'erp_stock',
      'erp_attrs',
      'erp_prices',
      'erp_payments',
      'erp_finance',
      'erp_sellers',
      'erp_suppliers',
      'erp_employees',
      'erp_audit',
      'erp_plan',
    ];
  }
  return [];
}

/** Administrador da loja (role admin) — ou bootstrap sem usuários vinculados. */
export function userIsStoreAdmin(userEmail: string | null | undefined) {
  const employee = findEmployeeByUserEmail(userEmail);
  if (employee) return employee.active && employee.role === 'admin';
  return linkedSystemUsers().length === 0;
}

export function navPathToAccessArea(path: string): AccessArea | null {
  const clean = path.split('?')[0];
  return pathToAccessArea(clean);
}
