/**
 * Central de Replicação e Sincronização entre Filiais do Mesmo Grupo.
 *
 * Permite replicar cadastros comerciais entre lojas (Matriz <-> Filiais):
 * - Produtos & Catálogo de Estoque
 * - Clientes & Contatos
 * - Vendedores & Comissões
 * - Campanhas Promocionais & Tabelas de Preço
 *
 * REGRA INEGOCIÁVEL DE SEGURANÇA E ISOLAMENTO:
 * - Caixa / Movimentações de PDV: NUNCA replicável (100% individual por filial).
 * - Ordens de Serviço (OS) & Bancada Técnica: NUNCA replicável (100% individual por filial).
 */

import { getAdminState, saveStock, upsertCustomer, type StockItem } from './adminStore';
import { listSellers, upsertSeller } from './erpRegistry';
import { listPromoCampaigns, upsertPromoCampaign } from './promoCampaignStore';
import { getStoreById, MULTI_STORE_CHANGED_EVENT } from './multiStoreStore';

export const REPLICATION_EVENT = 'marthi-store-replication-event';
const REPLICATION_LOGS_KEY = 'marthi.store.replication_logs.v1';

export type ReplicationModules = {
  products: boolean;
  customers: boolean;
  sellers: boolean;
  campaigns: boolean;
  resetStockQty?: boolean;
};

export type ReplicationLog = {
  id: string;
  sourceStoreId: string;
  sourceStoreName: string;
  targetStoreId: string;
  targetStoreName: string;
  modules: ReplicationModules;
  productsCount: number;
  customersCount: number;
  sellersCount: number;
  campaignsCount: number;
  operatorName: string;
  timestamp: string;
  status: 'success' | 'failed';
  message: string;
};

export type ReplicationMetrics = {
  productsCount: number;
  customersCount: number;
  sellersCount: number;
  campaignsCount: number;
};

export function getReplicationMetrics(): ReplicationMetrics {
  try {
    const admin = getAdminState();
    const sellers = listSellers();
    const campaigns = listPromoCampaigns();

    return {
      productsCount: admin.stock.length,
      customersCount: admin.customers.length,
      sellersCount: sellers.length,
      campaignsCount: campaigns.length,
    };
  } catch {
    return {
      productsCount: 0,
      customersCount: 0,
      sellersCount: 0,
      campaignsCount: 0,
    };
  }
}

export function getReplicationLogs(): ReplicationLog[] {
  try {
    const raw = localStorage.getItem(REPLICATION_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveReplicationLog(log: ReplicationLog) {
  try {
    const logs = getReplicationLogs();
    const next = [log, ...logs.slice(0, 49)];
    localStorage.setItem(REPLICATION_LOGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(REPLICATION_EVENT));
  } catch {
    /* ignore */
  }
}

export type ExecuteReplicationParams = {
  sourceStoreId: string;
  targetStoreId: string;
  modules: ReplicationModules;
  operatorName?: string;
};

export type ExecuteReplicationResult = {
  success: boolean;
  productsReplicated: number;
  customersReplicated: number;
  sellersReplicated: number;
  campaignsReplicated: number;
  message: string;
};

export async function executeStoreReplication(
  params: ExecuteReplicationParams,
): Promise<ExecuteReplicationResult> {
  const { sourceStoreId, targetStoreId, modules, operatorName = 'Administrador' } = params;

  if (!sourceStoreId || !targetStoreId) {
    throw new Error('Informe a Loja de Origem e a Loja de Destino para a replicação.');
  }

  if (sourceStoreId === targetStoreId) {
    throw new Error('A Loja de Origem e a Loja de Destino devem ser diferentes.');
  }

  const sourceStore = getStoreById(sourceStoreId);
  const targetStore = getStoreById(targetStoreId);

  if (!sourceStore) {
    throw new Error(`Loja de origem (${sourceStoreId}) não encontrada.`);
  }
  if (!targetStore) {
    throw new Error(`Loja de destino (${targetStoreId}) não encontrada.`);
  }

  let productsReplicated = 0;
  let customersReplicated = 0;
  let sellersReplicated = 0;
  let campaignsReplicated = 0;

  try {
    const admin = getAdminState();

    // 1. REPLICAÇÃO DE PRODUTOS
    if (modules.products) {
      const sourceStock = [...admin.stock];
      const existingStock = [...admin.stock];

      const clonedStock: StockItem[] = sourceStock.map((item) => {
        const resetQty = modules.resetStockQty === true;
        return {
          ...item,
          id: `STK-${targetStore.code}-${item.sku || Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          qty: resetQty ? 0 : item.qty,
          showOnTotem: item.showOnTotem,
          images: Array.isArray(item.images) ? [...item.images] : [],
          attrs: { ...(item.attrs || {}) },
        };
      });

      // Evita duplicar se o mesmo SKU ou Barcode já existir
      const mergedStock: StockItem[] = [...existingStock];
      for (const candidate of clonedStock) {
        const idx = mergedStock.findIndex(
          (s) =>
            (candidate.sku && s.sku && s.sku === candidate.sku) ||
            (candidate.barcode && s.barcode && s.barcode === candidate.barcode),
        );
        if (idx >= 0) {
          // Já existe produto similar, atualiza detalhes mantendo estoque da filial se aplicável
          mergedStock[idx] = {
            ...mergedStock[idx],
            name: candidate.name,
            price: candidate.price,
            cost: candidate.cost,
            images: candidate.images.length ? candidate.images : mergedStock[idx].images,
            attrs: { ...mergedStock[idx].attrs, ...candidate.attrs },
          };
        } else {
          mergedStock.push(candidate);
          productsReplicated++;
        }
      }

      saveStock(mergedStock);
    }

    // 2. REPLICAÇÃO DE CLIENTES
    if (modules.customers) {
      const sourceCustomers = [...admin.customers];
      for (const customer of sourceCustomers) {
        await upsertCustomer({
          name: customer.name,
          phone: customer.phone,
          document: customer.document,
          email: customer.email,
          city: customer.city,
          zipCode: customer.zipCode,
          street: customer.street,
          number: customer.number,
          complement: customer.complement,
          neighborhood: customer.neighborhood,
          state: customer.state,
          active: customer.active,
        });
        customersReplicated++;
      }
    }

    // 3. REPLICAÇÃO DE VENDEDORES
    if (modules.sellers) {
      const sourceSellers = listSellers();
      for (const seller of sourceSellers) {
        await upsertSeller({
          name: seller.name,
          phone: seller.phone,
          email: seller.email,
          document: seller.document,
          commissionPercent: seller.commissionPercent,
          active: seller.active,
        });
        sellersReplicated++;
      }
    }

    // 4. REPLICAÇÃO DE CAMPANHAS
    if (modules.campaigns) {
      const sourceCampaigns = listPromoCampaigns();
      for (const camp of sourceCampaigns) {
        upsertPromoCampaign({
          name: `${camp.name} (Filial ${targetStore.code})`,
          kind: camp.kind,
          active: camp.active,
          stockIds: Array.isArray(camp.stockIds) ? [...camp.stockIds] : [],
          criteria: { ...camp.criteria },
          discountPercent: camp.discountPercent,
          discountAmount: camp.discountAmount,
          promoPrice: camp.promoPrice,
          tiers: Array.isArray(camp.tiers) ? [...camp.tiers] : [],
          buyQty: camp.buyQty,
          payQty: camp.payQty,
          giftStockId: camp.giftStockId,
          giftMinQty: camp.giftMinQty,
          startDate: camp.startDate,
          endDate: camp.endDate,
          priority: camp.priority,
          accumulative: camp.accumulative,
          note: camp.note ? `[Replicada de ${sourceStore.name}] ${camp.note}` : `Replicada de ${sourceStore.name}`,
        });
        campaignsReplicated++;
      }
    }

    const message = `Replicação concluída com sucesso de "${sourceStore.tradeName || sourceStore.name}" para "${targetStore.tradeName || targetStore.name}".`;

    saveReplicationLog({
      id: `REP-${Date.now().toString(36).toUpperCase()}`,
      sourceStoreId,
      sourceStoreName: sourceStore.tradeName || sourceStore.name,
      targetStoreId,
      targetStoreName: targetStore.tradeName || targetStore.name,
      modules,
      productsCount: productsReplicated,
      customersCount: customersReplicated,
      sellersCount: sellersReplicated,
      campaignsCount: campaignsReplicated,
      operatorName,
      timestamp: new Date().toISOString(),
      status: 'success',
      message,
    });

    window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));

    return {
      success: true,
      productsReplicated,
      customersReplicated,
      sellersReplicated,
      campaignsReplicated,
      message,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Falha na replicação de dados entre lojas.';
    saveReplicationLog({
      id: `REP-${Date.now().toString(36).toUpperCase()}`,
      sourceStoreId,
      sourceStoreName: sourceStore.tradeName || sourceStore.name,
      targetStoreId,
      targetStoreName: targetStore.tradeName || targetStore.name,
      modules,
      productsCount: productsReplicated,
      customersCount: customersReplicated,
      sellersCount: sellersReplicated,
      campaignsCount: campaignsReplicated,
      operatorName,
      timestamp: new Date().toISOString(),
      status: 'failed',
      message: errMsg,
    });
    throw new Error(errMsg);
  }
}
