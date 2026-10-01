import type { PartnerModuleId } from './catalog';
import { isMarthiStaffEmail } from './marthiStaff';
import {
  apiCreateEmployee,
  apiCreateSeller,
  apiCreateSupplier,
  apiDeleteEmployee,
  apiDeleteSeller,
  apiDeleteSupplier,
  apiListEmployees,
  apiListSellers,
  apiListSuppliers,
  apiUpdateEmployee,
  apiUpdateSeller,
  apiUpdateSupplier,
  type ApiEmployee,
  type ApiSeller,
  type ApiSupplier,
} from '../services/erpApi';
import { isNestAuthed } from '../services/nestClient';
import { getActiveTenantKey, tenantScopedKey, isRealClientTenant } from './tenantContext';
import { listMarthiClients } from './marthiClientsStore';
import { setErpUserPassword } from './erpUserPasswords';

const STORAGE_KEY = 'marthi.erp.registry.v1';

/** Áreas finas do painel (além do módulo do plano). */
export type AccessArea =
  | 'painel'
  | 'totem'
  | 'pdv'
  | 'os'
  | 'erp'
  | 'fiscal'
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
  painel: 'Painel (Visão da operação)',
  totem: 'Totem',
  pdv: 'PDV / Caixa / Pedidos',
  os: 'Ordens de serviço',
  erp: 'Retaguarda (ERP)',
  fiscal: 'Emissor Fiscal',
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

export type EmployeePermissions = {
  posCancelSale?: boolean;
  posCancelItem?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  posAdHocConfigure?: boolean;
  posAdHocLaunch?: boolean;
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
  permissions?: EmployeePermissions;
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

function seedForTenant(activeTenant: string): RegistryState {
  const state: RegistryState = {
    employees: [],
    sellers: [],
    suppliers: [],
  };

  const isCellPontoTenant =
    activeTenant.includes('ACC-MARTHI-DEMO') ||
    activeTenant.includes('gilvan') ||
    activeTenant.includes('mariana') ||
    activeTenant.includes('cell') ||
    activeTenant.startsWith('emp_') ||
    activeTenant === 'client_CLI-DEMO-01' ||
    activeTenant === 'default';

  if (isCellPontoTenant) {
    state.employees.push({
      id: 'EMP-GILVAN-01',
      name: 'Gilvan Teodoro',
      phone: '(24) 98124-4253',
      email: 'gilvanteodo@gmail.com',
      document: '61.506.270/0001-63',
      role: 'admin',
      isSystemUser: true,
      userEmail: 'gilvanteodo@gmail.com',
      accessAreas: [...ALL_ACCESS_AREAS],
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });
    state.employees.push({
      id: 'EMP-MARIANA-01',
      name: 'Mariana Veiga',
      phone: '(24) 98124-4253',
      email: 'marianaveigatav@gmail.com',
      document: '123.456.789-00',
      role: 'admin',
      isSystemUser: true,
      userEmail: 'marianaveigatav@gmail.com',
      accessAreas: [...ALL_ACCESS_AREAS],
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });
  } else if (activeTenant.startsWith('client_')) {
    const clientId = activeTenant.slice('client_'.length);
    const client = listMarthiClients().find((c) => c.clientId === clientId);
    if (client) {
      state.employees.push({
        id: uid('EMP'),
        name: client.tradeName,
        phone: client.phone || '',
        email: client.email,
        document: client.document || '',
        role: 'admin',
        isSystemUser: true,
        userEmail: client.email,
        accessAreas: [...ALL_ACCESS_AREAS],
        active: true,
        createdAt: now(),
        updatedAt: now(),
      });
      if (client.tradeName.toLowerCase().includes('cell')) {
        state.employees.push({
          id: 'EMP-GILVAN-01',
          name: 'Gilvan Teodoro',
          phone: '(24) 98124-4253',
          email: 'gilvanteodo@gmail.com',
          document: '61.506.270/0001-63',
          role: 'admin',
          isSystemUser: true,
          userEmail: 'gilvanteodo@gmail.com',
          accessAreas: [...ALL_ACCESS_AREAS],
          active: true,
          createdAt: now(),
          updatedAt: now(),
        });
        state.employees.push({
          id: 'EMP-MARIANA-01',
          name: 'Mariana Veiga',
          phone: '(24) 98124-4253',
          email: 'marianaveigatav@gmail.com',
          document: '123.456.789-00',
          role: 'admin',
          isSystemUser: true,
          userEmail: 'marianaveigatav@gmail.com',
          accessAreas: [...ALL_ACCESS_AREAS],
          active: true,
          createdAt: now(),
          updatedAt: now(),
        });
      }
    }
  }

  return state;
}

let memoryRegistryTenant: string | null = null;
let memoryRegistryState: RegistryState | null = null;

function load(): RegistryState {
  const activeTenant = getActiveTenantKey();
  if (memoryRegistryState && memoryRegistryTenant === activeTenant) {
    return memoryRegistryState;
  }
  memoryRegistryTenant = activeTenant;
  const key = tenantScopedKey(STORAGE_KEY, activeTenant);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const seeded = seedForTenant(activeTenant);
      save(seeded);
      memoryRegistryState = seeded;
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<RegistryState>;
    const isMockEmail = (mail?: string) =>
      Boolean(
        mail &&
          (mail.includes('@loja.local') ||
            mail.includes('@celsul.local') ||
            mail.includes('@parceiro.local') ||
            (isRealClientTenant() && mail.includes('teste@marthi.com.br'))),
      );
    const isMockName = (name?: string) =>
      Boolean(
        name &&
          (name === 'Ana Costa' ||
            name === 'Bruno Vendas' ||
            name === 'Distribuidora Celular Sul' ||
            name === 'Administrador da loja' ||
            name.toLowerCase().includes('marthi basic') ||
            name.toLowerCase().includes('marthi teste') ||
            name.trim().toLowerCase() === 'operador' ||
            name.trim().toLowerCase() === 'operador caixa' ||
            (isRealClientTenant() && name === 'Operador Caixa')),
      );
    const sellers = (Array.isArray(parsed.sellers) ? parsed.sellers : []).filter(
      (s) => !isMockEmail(s.email) && !isMockName(s.name),
    );
    const suppliers = (Array.isArray(parsed.suppliers) ? parsed.suppliers : []).filter(
      (s) => !isMockEmail(s.email) && !isMockName(s.name),
    );
    let employees = (Array.isArray(parsed.employees) ? parsed.employees : []).filter(
      (e) => !isMockEmail(e.email) && !isMockEmail(e.userEmail) && !isMockName(e.name),
    );

    // Se o cliente for novo e não tiver funcionário admin ainda, adiciona automaticamente o responsável
    if (activeTenant.startsWith('client_') && employees.length === 0) {
      const clientId = activeTenant.slice('client_'.length);
      const client = listMarthiClients().find((c) => c.clientId === clientId);
      if (client) {
        employees = [
          {
            id: uid('EMP'),
            name: client.tradeName,
            phone: client.phone || '',
            email: client.email,
            document: client.document || '',
            role: 'admin',
            isSystemUser: true,
            userEmail: client.email,
            accessAreas: [...ALL_ACCESS_AREAS],
            active: true,
            createdAt: now(),
            updatedAt: now(),
          },
        ];
      }
    }

    const isCellPontoTenant =
      activeTenant === 'default' ||
      activeTenant.toLowerCase().includes('cell') ||
      activeTenant.toLowerCase().includes('ponto') ||
      activeTenant.toLowerCase().includes('gilvan') ||
      activeTenant.toLowerCase().includes('mariana') ||
      activeTenant.toLowerCase().includes('demo') ||
      activeTenant.startsWith('acc_') ||
      activeTenant.startsWith('emp_') ||
      activeTenant.startsWith('client_cli-demo');

    if (employees.length === 0 && isCellPontoTenant) {
      const seeded = seedForTenant(activeTenant);
      employees = seeded.employees;
    }

    // Garante que Gilvan e Mariana estejam sempre no estado com role admin e acesso total
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const hasGilvan = employees.some((e) => norm(e.userEmail || e.email) === 'gilvanteodo@gmail.com');
    const hasMariana = employees.some((e) => norm(e.userEmail || e.email) === 'marianaveigatav@gmail.com');

    if (!hasGilvan) {
      employees.unshift({
        id: 'EMP-GILVAN-01',
        name: 'Gilvan Teodoro',
        phone: '(24) 98124-4253',
        email: 'gilvanteodo@gmail.com',
        document: '61.506.270/0001-63',
        role: 'admin',
        isSystemUser: true,
        userEmail: 'gilvanteodo@gmail.com',
        accessAreas: [...ALL_ACCESS_AREAS],
        active: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }

    if (!hasMariana) {
      employees.push({
        id: 'EMP-MARIANA-01',
        name: 'Mariana Veiga',
        phone: '(24) 98124-4253',
        email: 'marianaveigatav@gmail.com',
        document: '123.456.789-00',
        role: 'admin',
        isSystemUser: true,
        userEmail: 'marianaveigatav@gmail.com',
        accessAreas: [...ALL_ACCESS_AREAS],
        active: true,
        createdAt: now(),
        updatedAt: now(),
      });
    }

    // Normaliza administradores cadastrados
    employees = employees.map((emp) => {
      const mail = norm(emp.userEmail || emp.email);
      if (mail === 'gilvanteodo@gmail.com' || mail === 'marianaveigatav@gmail.com') {
        return {
          ...emp,
          role: 'admin',
          isSystemUser: true,
          active: true,
          accessAreas: [...ALL_ACCESS_AREAS],
        };
      }
      return emp;
    });

    const state: RegistryState = { sellers, suppliers, employees };
    memoryRegistryState = state;
    return state;
  } catch {
    const seeded = seedForTenant(activeTenant);
    save(seeded);
    memoryRegistryState = seeded;
    return seeded;
  }
}

function save(state: RegistryState) {
  const activeTenant = getActiveTenantKey();
  memoryRegistryTenant = activeTenant;
  memoryRegistryState = state;
  const key = tenantScopedKey(STORAGE_KEY, activeTenant);
  localStorage.setItem(key, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-erp-registry-updated'));
}

/** Substitui fatias do registry (bootstrap Nest). */
export function replaceErpRegistry(partial: Partial<RegistryState>) {
  const state = load();
  let emps = partial.employees ?? state.employees;

  // Garante que a sincronização da API não apague Gilvan e Mariana da listagem
  const norm = (s?: string) => (s || '').trim().toLowerCase();
  const hasGilvan = emps.some((e) => norm(e.userEmail || e.email) === 'gilvanteodo@gmail.com');
  const hasMariana = emps.some((e) => norm(e.userEmail || e.email) === 'marianaveigatav@gmail.com');

  if (!hasGilvan) {
    const g = state.employees.find((e) => norm(e.userEmail || e.email) === 'gilvanteodo@gmail.com');
    if (g) emps = [g, ...emps];
  }
  if (!hasMariana) {
    const m = state.employees.find((e) => norm(e.userEmail || e.email) === 'marianaveigatav@gmail.com');
    if (m) emps = [...emps, m];
  }

  save({
    sellers: partial.sellers ?? state.sellers,
    suppliers: partial.suppliers ?? state.suppliers,
    employees: emps,
  });
}

function mapSeller(row: ApiSeller): Seller {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    document: row.document ?? '',
    commissionPercent: Number(row.commissionPercent ?? 0),
    active: row.active,
    employeeId: row.employeeId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSupplier(row: ApiSupplier): Supplier {
  return {
    id: row.id,
    name: row.name,
    tradeName: row.tradeName ?? '',
    document: row.document ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    city: row.city ?? '',
    notes: row.notes ?? '',
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEmployee(row: ApiEmployee): Employee {
  const areas = (row.accessAreas ?? []).filter((a): a is AccessArea =>
    ALL_ACCESS_AREAS.includes(a as AccessArea),
  );
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    document: row.document ?? '',
    role: row.role,
    isSystemUser: row.isSystemUser,
    userEmail: row.userEmail ?? '',
    accessAreas: areas,
    permissions: row.permissions,
    active: row.active,
    sellerId: row.sellerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Hidrata sellers/suppliers/employees a partir do Nest (Fase 3 P0). */
export async function hydrateErpRegistryFromApi() {
  if (!isNestAuthed()) return;
  const [sellers, suppliers, employees] = await Promise.all([
    apiListSellers(),
    apiListSuppliers(),
    apiListEmployees(),
  ]);
  replaceErpRegistry({
    sellers: sellers.map(mapSeller),
    suppliers: suppliers.map(mapSupplier),
    employees: employees.map(mapEmployee),
  });
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

export async function upsertSeller(
  input: Omit<Seller, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<RegistryState> {
  if (isNestAuthed()) {
    try {
      const body = {
        name: input.name.trim(),
        phone: (input.phone ?? '').trim(),
        email: (input.email ?? '').trim(),
        document: (input.document ?? '').trim(),
        commissionPercent: Math.max(0, Math.min(100, Number(input.commissionPercent ?? 0) || 0)),
        active: input.active ?? true,
        employeeId: input.employeeId,
      };
      const row = input.id
        ? await apiUpdateSeller(input.id, body)
        : await apiCreateSeller(body);
      const mapped = mapSeller(row);
      const state = load();
      const idx = state.sellers.findIndex((item) => item.id === mapped.id);
      state.sellers =
        idx >= 0
          ? state.sellers.map((item) => (item.id === mapped.id ? mapped : item))
          : [mapped, ...state.sellers];
      save(state);
      return state;
    } catch (err) {
      console.error('[erpRegistry] Falha na API Nest ao salvar vendedor:', err);
      throw err;
    }
  }

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

export async function upsertSupplier(
  input: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<RegistryState> {
  if (isNestAuthed()) {
    try {
      const body = {
        name: input.name.trim(),
        tradeName: (input.tradeName ?? '').trim(),
        document: (input.document ?? '').trim(),
        phone: (input.phone ?? '').trim(),
        email: (input.email ?? '').trim(),
        city: (input.city ?? '').trim(),
        notes: (input.notes ?? '').trim(),
        active: input.active ?? true,
      };
      const row = input.id
        ? await apiUpdateSupplier(input.id, body)
        : await apiCreateSupplier(body);
      const mapped = mapSupplier(row);
      const state = load();
      const idx = state.suppliers.findIndex((item) => item.id === mapped.id);
      state.suppliers =
        idx >= 0
          ? state.suppliers.map((item) => (item.id === mapped.id ? mapped : item))
          : [mapped, ...state.suppliers];
      save(state);
      return state;
    } catch (err) {
      console.error('[erpRegistry] Falha na API Nest ao salvar fornecedor:', err);
      throw err;
    }
  }

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

export async function removeSeller(id: string): Promise<RegistryState> {
  if (isNestAuthed()) {
    try {
      await apiDeleteSeller(id);
    } catch (err) {
      console.warn('[erpRegistry] Falha ao excluir vendedor no Nest:', err);
    }
  }
  const state = load();
  state.sellers = state.sellers.filter((item) => item.id !== id);
  save(state);
  return state;
}

export async function removeSupplier(id: string): Promise<RegistryState> {
  if (isNestAuthed()) {
    try {
      await apiDeleteSupplier(id);
    } catch (err) {
      console.warn('[erpRegistry] Falha ao excluir fornecedor no Nest:', err);
    }
  }
  const state = load();
  state.suppliers = state.suppliers.filter((item) => item.id !== id);
  save(state);
  return state;
}

export async function removeEmployee(id: string): Promise<RegistryState> {
  if (isNestAuthed()) {
    try {
      await apiDeleteEmployee(id);
    } catch (err) {
      console.warn('[erpRegistry] Falha ao excluir no Nest, removendo localmente:', err);
    }
  }
  const state = load();
  state.employees = state.employees.filter((item) => item.id !== id);
  save(state);
  return state;
}

export type EmployeeSaveResult =
  | { ok: true; state: RegistryState; employee: Employee }
  | { ok: false; error: string };

export async function upsertEmployee(
  input: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; accessPassword?: string },
): Promise<EmployeeSaveResult> {
  const email = normalizeEmail(input.email);
  const userEmail = input.isSystemUser ? normalizeEmail(input.userEmail || input.email) : '';

  if (!input.name.trim()) return { ok: false, error: 'Informe o nome do funcionário.' };
  if (input.isSystemUser && !userEmail) {
    return { ok: false, error: 'Funcionário usuário precisa de e-mail de login.' };
  }

  if (isNestAuthed()) {
    try {
      const NEST_VALID_AREAS = new Set([
        'totem', 'pdv', 'os', 'erp_customers', 'erp_stock', 'erp_attrs',
        'erp_prices', 'erp_payments', 'erp_finance', 'erp_sellers',
        'erp_suppliers', 'erp_employees', 'erp_audit', 'erp_invoices',
        'erp_fiscal', 'ecommerce', 'erp_plan', 'painel', 'erp', 'fiscal',
      ]);
      const areas = (
        input.role === 'admin'
          ? defaultAdminAreas().filter((a) => NEST_VALID_AREAS.has(a))
          : input.accessAreas.filter((area) => NEST_VALID_AREAS.has(area))
      ) as AccessArea[];

      const body = {
        name: input.name.trim(),
        phone: (input.phone ?? '').trim(),
        email,
        document: (input.document ?? '').trim(),
        role: input.role,
        isSystemUser: input.isSystemUser,
        userEmail,
        accessAreas: areas,
        permissions: input.permissions,
        active: input.active ?? true,
        sellerId: input.sellerId,
        accessPassword: input.accessPassword,
      };
      const row = input.id
        ? await apiUpdateEmployee(input.id, body)
        : await apiCreateEmployee(body);
      const mapped = mapEmployee(row);
      const state = load();
      const idx = state.employees.findIndex((item) => item.id === mapped.id);
      state.employees =
        idx >= 0
          ? state.employees.map((item) => (item.id === mapped.id ? mapped : item))
          : [mapped, ...state.employees];
      save(state);
      if (input.accessPassword && userEmail) {
        setErpUserPassword(userEmail, input.accessPassword);
      }
      return { ok: true, state, employee: mapped };
    } catch (error) {
      console.error('[erpRegistry] Falha ao sincronizar com Nest:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao sincronizar cadastro com o servidor backend.',
      };
    }
  }

  const state = load();
  const stamp = now();

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
    permissions: input.permissions,
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
  if (input.accessPassword && userEmail) {
    setErpUserPassword(userEmail, input.accessPassword);
  }
  return { ok: true, state, employee: payload };
}

/** Funcionário usuário ativo pelo e-mail de login. */
export function findEmployeeByUserEmail(email: string | null | undefined): Employee | null {
  const key = normalizeEmail(email ?? '');
  if (!key) return null;
  const found = load().employees.find(
    (item) =>
      item.active &&
      item.isSystemUser &&
      normalizeEmail(item.userEmail || item.email) === key,
  );
  if (found) return found;
  if (key === 'marthi.tecnologia@gmail.com' || key.includes('marthi.tecnologia')) {
    return {
      id: 'EMP-MARTHI-ADMIN',
      name: 'Marthi Tecnologia',
      phone: '',
      email: 'marthi.tecnologia@gmail.com',
      document: '',
      role: 'admin',
      isSystemUser: true,
      userEmail: 'marthi.tecnologia@gmail.com',
      accessAreas: [...ALL_ACCESS_AREAS],
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    };
  }
  if (key === 'marianaveigatav@gmail.com') {
    return {
      id: 'EMP-MARIANA-01',
      name: 'Mariana Veiga',
      phone: '(24) 98124-4253',
      email: 'marianaveigatav@gmail.com',
      document: '123.456.789-00',
      role: 'admin',
      isSystemUser: true,
      userEmail: 'marianaveigatav@gmail.com',
      accessAreas: [...ALL_ACCESS_AREAS],
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    };
  }
  if (key === 'gilvanteodo@gmail.com') {
    return {
      id: 'EMP-GILVAN-01',
      name: 'Gilvan Teodoro',
      phone: '(24) 98124-4253',
      email: 'gilvanteodo@gmail.com',
      document: '61.506.270/0001-63',
      role: 'admin',
      isSystemUser: true,
      userEmail: 'gilvanteodo@gmail.com',
      accessAreas: [...ALL_ACCESS_AREAS],
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    };
  }
  return null;
}

export function employeeHasArea(employee: Employee | null, area: AccessArea) {
  if (!employee) return true;
  if (!employee.active) return false;
  if (employee.role === 'admin') return true;
  if (employee.accessAreas.includes(area)) return true;
  if (employee.accessAreas.includes('erp') && area.startsWith('erp_')) return true;
  if (employee.accessAreas.includes('fiscal') && (area === 'erp_fiscal' || area === 'erp_invoices')) return true;
  return false;
}


export function pathToAccessArea(pathname: string): AccessArea | null {
  if (
    pathname === '/painel' ||
    pathname.startsWith('/painel/operacoes') ||
    pathname.startsWith('/painel/usuarios')
  ) {
    return 'painel';
  }
  // Catálogo lite do Totem (produtos/atributos) fica sob área totem — não exige erp_stock.
  if (pathname.startsWith('/painel/totem')) return 'totem';
  if (pathname.startsWith('/painel/pdv') || pathname.startsWith('/painel/pedidos')) return 'pdv';
  if (pathname.startsWith('/painel/os') || pathname.startsWith('/os')) return 'os';
  if (pathname.startsWith('/erp/clientes') || pathname.startsWith('/painel/clientes')) {
    return 'erp_customers';
  }
  if (
    pathname.startsWith('/erp/produtos') ||
    pathname.startsWith('/erp/kits') ||
    pathname.startsWith('/erp/lotes') ||
    pathname.startsWith('/erp/almoxarifado') ||
    pathname.startsWith('/painel/produtos') ||
    pathname.startsWith('/painel/estoque') ||
    pathname.startsWith('/painel/kits') ||
    pathname.startsWith('/painel/lotes') ||
    pathname.startsWith('/painel/almoxarifado')
  ) {
    return 'erp_stock';
  }
  if (pathname.startsWith('/erp/atributos') || pathname.startsWith('/painel/atributos')) {
    return 'erp_attrs';
  }
  if (pathname.startsWith('/erp/tabelas') || pathname.startsWith('/painel/tabelas')) {
    return 'erp_prices';
  }
  if (pathname.startsWith('/painel/pagamentos')) return 'erp_payments';
  if (
    pathname.startsWith('/erp/financeiro') ||
    pathname.startsWith('/erp/boletos') ||
    pathname.startsWith('/painel/financeiro')
  ) {
    return 'erp_finance';
  }
  if (pathname.startsWith('/erp/vendedores') || pathname.startsWith('/painel/vendedores')) {
    return 'erp_sellers';
  }
  if (pathname.startsWith('/erp/fornecedores') || pathname.startsWith('/painel/fornecedores')) {
    return 'erp_suppliers';
  }
  if (
    pathname.startsWith('/erp/funcionarios') ||
    pathname.startsWith('/erp/permissoes') ||
    pathname.startsWith('/painel/funcionarios') ||
    pathname.startsWith('/painel/permissoes')
  ) {
    return 'erp_employees';
  }
  if (
    pathname.startsWith('/erp/auditoria') ||
    pathname.startsWith('/erp/relatorios') ||
    pathname.startsWith('/painel/auditoria') ||
    pathname.startsWith('/painel/erp') ||
    pathname === '/erp'
  ) {
    return 'erp_audit';
  }
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
  const norm = normalizeEmail(userEmail || '');
  if (norm === 'gilvanteodo@gmail.com' || norm === 'marianaveigatav@gmail.com') return true;
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
  if (module === 'pdv') return ['pdv'];
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

export function resolveAppHome(userEmail: string | null | undefined): string {
  if (isMarthiStaffEmail(userEmail)) return '/admin';
  const employee = findEmployeeByUserEmail(userEmail);
  if (employee && employee.role !== 'admin' && !employee.accessAreas.includes('painel')) {
    const areas = employee.accessAreas;
    if (areas.includes('pdv')) return '/caixa';
    if (areas.includes('totem')) return '/totem';
    if (areas.includes('os')) return '/os';
    if (areas.includes('fiscal') || areas.includes('erp_fiscal') || areas.includes('erp_invoices')) return '/fiscal';
    if (areas.includes('ecommerce')) return '/ecommerce';
    if (areas.includes('erp')) return '/erp';
    return '/login';
  }
  if (userIsStoreAdmin(userEmail)) return '/painel';
  if (!employee) return '/painel';
  return '/painel';
}

/** Administrador da loja (role admin) — ou cliente contratante ou bootstrap sem usuários vinculados. */
export function userIsStoreAdmin(userEmail: string | null | undefined) {
  if (isMarthiStaffEmail(userEmail)) return true;
  const norm = normalizeEmail(userEmail || '');
  if (
    norm === 'marthi.tecnologia@gmail.com' ||
    norm === 'gilvanteodo@gmail.com' ||
    norm === 'marianaveigatav@gmail.com'
  ) return true;
  const isClient = listMarthiClients().some((c) => c.email.toLowerCase() === norm);
  if (isClient) return true;
  const employee = findEmployeeByUserEmail(userEmail);
  if (employee) return employee.active && employee.role === 'admin';
  return linkedSystemUsers().length === 0;
}

/** Permissão para cancelar venda no PDV */
export function userCanCancelSale(userEmail: string | null | undefined): boolean {
  if (isMarthiStaffEmail(userEmail)) return true;
  if (userIsStoreAdmin(userEmail)) return true;
  const emp = findEmployeeByUserEmail(userEmail);
  if (!emp) return linkedSystemUsers().length === 0;
  if (emp.role === 'admin' || emp.role === 'manager') return true;
  return Boolean(emp.permissions?.posCancelSale);
}

/** Permissão para cancelar / excluir item do carrinho no PDV */
export function userCanCancelItem(userEmail: string | null | undefined): boolean {
  if (isMarthiStaffEmail(userEmail)) return true;
  if (userIsStoreAdmin(userEmail)) return true;
  const emp = findEmployeeByUserEmail(userEmail);
  if (!emp) return linkedSystemUsers().length === 0;
  if (emp.role === 'admin' || emp.role === 'manager') return true;
  return Boolean(emp.permissions?.posCancelItem);
}

/** Permissão para alterar / editar dados cadastrais nos módulos (Produtos, Clientes, etc.) */
export function userCanEdit(userEmail: string | null | undefined): boolean {
  if (isMarthiStaffEmail(userEmail)) return true;
  if (userIsStoreAdmin(userEmail)) return true;
  const emp = findEmployeeByUserEmail(userEmail);
  if (!emp) return linkedSystemUsers().length === 0;
  if (emp.role === 'admin' || emp.role === 'manager') return true;
  if (emp.role === 'seller') return Boolean(emp.permissions?.canEdit);
  return emp.permissions?.canEdit ?? true;
}

/** Permissão para excluir registros nos módulos cadastrais */
export function userCanDelete(userEmail: string | null | undefined): boolean {
  if (isMarthiStaffEmail(userEmail)) return true;
  if (userIsStoreAdmin(userEmail)) return true;
  const emp = findEmployeeByUserEmail(userEmail);
  if (!emp) return linkedSystemUsers().length === 0;
  if (emp.role === 'admin' || emp.role === 'manager') return true;
  return Boolean(emp.permissions?.canDelete);
}

/** Permissão para configurar o recurso de Venda Avulsa nos caixas */
export function userCanConfigureAdHoc(userEmail: string | null | undefined): boolean {
  if (isMarthiStaffEmail(userEmail)) return true;
  if (userIsStoreAdmin(userEmail)) return true;
  const emp = findEmployeeByUserEmail(userEmail);
  if (!emp) return linkedSystemUsers().length === 0;
  if (emp.role === 'admin' || emp.role === 'manager') return true;
  return Boolean(emp.permissions?.posAdHocConfigure);
}

/** Permissão operacional para lançar Venda Avulsa no PDV */
export function userCanLaunchAdHoc(userEmail: string | null | undefined): boolean {
  if (isMarthiStaffEmail(userEmail)) return true;
  if (userIsStoreAdmin(userEmail)) return true;
  const emp = findEmployeeByUserEmail(userEmail);
  if (!emp) return true;
  if (emp.role === 'admin' || emp.role === 'manager') return true;
  if (typeof emp.permissions?.posAdHocLaunch === 'boolean') {
    return emp.permissions.posAdHocLaunch;
  }
  return true;
}

export function navPathToAccessArea(path: string): AccessArea | null {
  const clean = path.split('?')[0];
  return pathToAccessArea(clean);
}
