/**
 * Matriz de capacidades por módulo (contrato).
 *
 * Princípio: cada app funciona sozinho. O que “empresta” do ERP (catálogo,
 * pessoas) libera-se como capability na aba do módulo no painel — não como
 * redirect morto para /erp.
 *
 * Estoque único (adminStore + attributeStore). Totem-only edita o mesmo
 * cadastro; ao contratar ERP os dados já estão lá.
 *
 * | Capability              | Totem | ERP/PDV | OS  | Fiscal | E-com | CRM |
 * |-------------------------|-------|---------|-----|--------|-------|-----|
 * | totem.ops               | x     |         |     |        |       |     |
 * | catalog.lite            | x     | x       | x   |        | x     |     |
 * | catalog.full            |       | x       |     |        |       |     |
 * | customers.lite          |       | x       | x   |        |       |     |
 * | customers.full          |       | x       |     |        |       |     |
 * | finance.full            |       | x       |     |        |       |     |
 * | fiscal.ops              |       |         |     | x      |       |     |
 * | ecommerce.ops           |       |         |     |        | x     |     |
 * | crm.ops                 |       |         |     |        |       | x   |
 * | os.ops                  |       |         | x   |        |       |     |
 * | pdv.ops                 |       | x       |     |        |       |     |
 */

import { hasModule } from './storePlan';

export type ModuleCapability =
  | 'totem.ops'
  | 'catalog.lite'
  | 'catalog.full'
  | 'customers.lite'
  | 'customers.full'
  | 'finance.full'
  | 'fiscal.ops'
  | 'ecommerce.ops'
  | 'crm.ops'
  | 'os.ops'
  | 'pdv.ops';

export function hasCapability(id: ModuleCapability): boolean {
  switch (id) {
    case 'totem.ops':
      return hasModule('totem');
    case 'catalog.lite':
      return (
        hasModule('totem') || hasModule('erp') || hasModule('os') || hasModule('ecommerce') || hasModule('pdv')
      );
    case 'catalog.full':
      return hasModule('erp');
    case 'customers.lite':
      return hasModule('erp') || hasModule('os') || hasModule('pdv');
    case 'customers.full':
      return hasModule('erp');
    case 'finance.full':
      return hasModule('erp');
    case 'fiscal.ops':
      return hasModule('fiscal');
    case 'ecommerce.ops':
      return hasModule('ecommerce');
    case 'crm.ops':
      return true;
    case 'os.ops':
      return hasModule('os');
    case 'pdv.ops':
      return hasModule('pdv') || hasModule('erp');
    default:
      return false;
  }
}

/** Superfície de catálogo no painel Totem (vitrine / lite). */
export function isTotemCatalogPath(pathname: string) {
  return (
    pathname.startsWith('/painel/totem/produtos') ||
    pathname.startsWith('/painel/totem/atributos')
  );
}
