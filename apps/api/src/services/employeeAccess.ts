type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * Permissões de acesso por funcionário, conferidas no servidor (a tela só esconde; quem barra é a API).
 *
 * - Dono, administrador e gerente da loja: tudo liberado.
 * - Funcionário com login (cadastro em Pessoas › Permissões): só grava nas áreas liberadas para ele.
 *   "Retaguarda (ERP)" libera todas as telas da Retaguarda; "Emissor Fiscal" libera notas e fiscal.
 * - Dados sensíveis (financeiro, funcionários, relatórios) também ficam fechados para leitura.
 * - Nos cadastros, editar exige "pode editar" e excluir exige "pode excluir".
 * - Login sem cadastro de funcionário nesta loja (ex.: dono) não sofre restrição.
 */
type Rule = { group: RegExp; areas: string[]; guardReads?: boolean; registry?: boolean };

const RULES: Rule[] = [
  { group: /^work-orders$/, areas: ['os'] },
  { group: /^(finance|payables|receivables|bank-accounts|boletos|treasury)$/, areas: ['erp_finance'], guardReads: true, registry: true },
  { group: /^employees$/, areas: ['erp_employees'], guardReads: true, registry: true },
  { group: /^reports$/, areas: ['erp_audit', 'pdv'], guardReads: true },
  { group: /^customers$/, areas: ['erp_customers', 'pdv', 'os'], registry: true },
  { group: /^suppliers$/, areas: ['erp_suppliers', 'erp_stock', 'erp_invoices'], registry: true },
  { group: /^sellers$/, areas: ['erp_sellers'], registry: true },
  { group: /^(stock|brands|products|device-reference|product-types|product-groups)$/, areas: ['erp_stock', 'totem'], registry: true },
  { group: /^attributes$/, areas: ['erp_attrs', 'erp_stock', 'totem'], registry: true },
  { group: /^pickup-methods$/, areas: ['erp_stock', 'totem'], registry: true },
  { group: /^(price-tables|promotions)$/, areas: ['erp_prices'], registry: true },
  { group: /^payments$/, areas: ['erp_payments'], registry: true },
  { group: /^stock-invoices$/, areas: ['erp_invoices'] },
  { group: /^(sales|pos|orders|goals|pickup-requests)$/, areas: ['pdv'] },
  { group: /^fiscal$/, areas: ['erp_fiscal', 'fiscal'] },
  { group: /^ecommerce$/, areas: ['ecommerce'] },
];

const FULL_ROLES = new Set(['admin', 'superadmin', 'owner', 'manager']);

export const AREA_LABEL: Record<string, string> = {
  os: 'Ordens de serviço',
  erp_finance: 'Financeiro',
  erp_employees: 'Funcionários',
  erp_audit: 'Auditoria e relatórios',
  erp_customers: 'Clientes',
  erp_suppliers: 'Fornecedores',
  erp_sellers: 'Vendedores',
  erp_stock: 'Produtos',
  erp_attrs: 'Atributos',
  erp_prices: 'Tabelas de preço',
  erp_payments: 'Formas de pagamento',
  erp_invoices: 'Notas de entrada e saída',
  pdv: 'PDV / vendas',
  erp_fiscal: 'Fiscal',
  ecommerce: 'E-commerce',
  totem: 'Totem',
};

function hasArea(areas: string[], wanted: string) {
  if (areas.includes(wanted)) return true;
  if (areas.includes('erp') && wanted.startsWith('erp_')) return true;
  if (areas.includes('fiscal') && (wanted === 'erp_fiscal' || wanted === 'erp_invoices')) return true;
  return false;
}

export type AccessDenial = { status: 403; code: 'AREA_FORBIDDEN' | 'EDIT_FORBIDDEN' | 'DELETE_FORBIDDEN'; message: string };

/** Devolve o motivo do bloqueio (ou null) e se o funcionário tem a tela liberada em Permissões. */
export async function checkEmployeeAccess(
  db: Queryable,
  input: { storeId: string; email: string; role: string; method: string; path: string },
): Promise<{ denial: AccessDenial | null; granted: boolean }> {
  const allow = (granted = false) => ({ denial: null, granted });
  const deny = (denial: AccessDenial) => ({ denial, granted: false });
  if (FULL_ROLES.has((input.role || '').toLowerCase())) return allow();
  const match = /^\/api\/v1\/([a-z0-9-]+)/.exec(input.path);
  const rule = match ? RULES.find((item) => item.group.test(match[1])) : undefined;
  if (!rule) return allow();
  const method = input.method.toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
  // Leitura comum (produtos, clientes…) é usada por vários módulos: não consulta permissões.
  if (isRead && !rule.guardReads) return allow();

  const employee = (
    await db.query(
      `SELECT role, access_areas, permissions, active FROM employees
        WHERE store_id = $1 AND is_system_user = true AND lower(coalesce(nullif(user_email, ''), email)) = lower($2)
        ORDER BY active DESC, updated_at DESC LIMIT 1`,
      [input.storeId, input.email],
    )
  ).rows[0];
  if (!employee) return allow();
  const role = String(employee.role || '').toLowerCase();
  if (employee.active && (role === 'admin' || role === 'manager')) return allow(true);

  const areas: string[] = Array.isArray(employee.access_areas) ? employee.access_areas.map(String) : [];
  if (!employee.active || !rule.areas.some((area) => hasArea(areas, area))) {
    if (isRead && !rule.guardReads) return allow();
    return deny({
      status: 403,
      code: 'AREA_FORBIDDEN',
      message: `Seu acesso não inclui ${AREA_LABEL[rule.areas[0]] ?? 'esta área'}. Peça ao administrador para liberar em Pessoas › Permissões.`,
    });
  }
  if (!rule.registry || isRead) return allow(true);
  const permissions = employee.permissions && typeof employee.permissions === 'object' ? employee.permissions : {};
  if (method === 'DELETE' && permissions.canDelete !== true) {
    return deny({ status: 403, code: 'DELETE_FORBIDDEN', message: 'Você não tem permissão para excluir registros. Peça ao administrador.' });
  }
  const canEdit = role === 'seller' ? permissions.canEdit === true : permissions.canEdit !== false;
  if ((method === 'PATCH' || method === 'PUT') && !canEdit) {
    return deny({ status: 403, code: 'EDIT_FORBIDDEN', message: 'Você não tem permissão para alterar registros. Peça ao administrador.' });
  }
  return allow(true);
}

/** Gestão da loja ou funcionário com a tela liberada em Permissões (conferido no login da requisição). */
export function canManageArea(req: { user?: { role?: string }; areaGranted?: boolean }) {
  return FULL_ROLES.has(String(req.user?.role ?? '').toLowerCase()) || req.areaGranted === true;
}
