import {getActiveTenantKey,tenantScopedKey} from './tenantContext';

/** Business caches never reuse global demo or another store's data. */
export function storeScopedKey(key:string):string {
 const tenant=getActiveTenantKey();
 if(tenant==='default') return key;
 const selected=localStorage.getItem(tenantScopedKey('marthi.multi_store.active_store_id.v1'));
 return `${key}:${tenant}:store:${selected || 'unselected'}`;
}
