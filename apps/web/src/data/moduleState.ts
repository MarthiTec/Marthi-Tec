import { nestGet, nestPut } from '../services/nestClient';
import { getActiveStoreId } from './multiStoreStore';
export type ModuleStateKey = 'card-rates' | 'cash-settings' | 'pos-quotes' | 'stock-inventory' | 'os-print-settings' | 'bank-files' | 'operations';
type Snapshot<T> = { data: T | null; revision: number };
const snapshots = new Map<string, Snapshot<unknown>>();
const cacheKey = (key: ModuleStateKey) => `${getActiveStoreId()}:${key}`;
export function readModuleState<T>(key: ModuleStateKey, empty: T): T {
  const snapshot = snapshots.get(cacheKey(key));
  return structuredClone((snapshot?.data ?? empty) as T);
}
export async function loadModuleState<T>(key: ModuleStateKey, empty: T): Promise<T> {
  const store = getActiveStoreId();
  const result = await nestGet<Snapshot<T>>(`/module-state/${key}`);
  if (store !== getActiveStoreId()) throw new Error('A loja mudou durante a consulta.');
  snapshots.set(cacheKey(key), result);
  return result.data ?? structuredClone(empty);
}
export async function saveModuleState<T>(key: ModuleStateKey, data: T): Promise<T> {
  const store = getActiveStoreId();
  const existing = snapshots.get(cacheKey(key));
  if (!existing) throw new Error('Carregue os dados do MarthiDB antes de salvar.');
  const result = await nestPut<Snapshot<T>>(`/module-state/${key}`, { revision: existing.revision, data });
  if (store !== getActiveStoreId()) throw new Error('A loja mudou durante a gravação.');
  snapshots.set(cacheKey(key), result);
  return result.data as T;
}
