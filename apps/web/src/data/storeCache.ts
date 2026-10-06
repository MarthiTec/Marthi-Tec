import {getActiveTenantKey,tenantScopedKey} from './tenantContext';
import {getExplicitTotemStoreId} from './totemContext';

/** Business caches never reuse global demo or another store's data. */
export function storeScopedKey(key:string):string {
 const tenant=getActiveTenantKey();
 const kioskStore=getExplicitTotemStoreId();
 if(kioskStore) return `${key}:${tenant}:public-store:${kioskStore}`;
 if(tenant==='default') return `${key}:public-store:unselected`;
 const selected=localStorage.getItem(tenantScopedKey('marthi.multi_store.active_store_id.v1'));
 return `${key}:${tenant}:store:${selected || 'unselected'}`;
}
