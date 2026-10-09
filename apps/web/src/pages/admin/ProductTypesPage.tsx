import { useCallback, useEffect, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import { useAuth } from '../../contexts/AuthContext';
import { userIsStoreAdmin } from '../../data/erpRegistry';
import { hubFullAccess } from '../../data/hubPaths';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import {
  apiCreateProductType,
  apiDeleteProductType,
  apiListProductTypes,
  apiUpdateProductType,
  type ProductType,
} from '../../services/productCatalogApi';

type Form = { id?: string; name: string; active: boolean };

/** Tipos de produto da loja (ex.: Smartphone, Acessório, Bebida). Escolhidos no cadastro do produto. */
export function ProductTypesPage() {
  const { user } = useAuth();
  const canEdit = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  const [types, setTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTypes(await apiListProductTypes());
      setMessage('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível carregar os tipos de produto.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const changed = () => { setForm(null); void load(); };
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, [load]);

  function open(item?: ProductType, view = false) {
    setMessage('');
    setReadOnly(view);
    setForm(item ? { id: item.id, name: item.name, active: item.active } : { name: '', active: true });
  }

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (form.id) await apiUpdateProductType(form.id, { name: form.name, active: form.active });
      else await apiCreateProductType({ name: form.name, active: form.active });
      setForm(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar o tipo de produto.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ProductType) {
    if (!confirmDelete(item.name)) return;
    try {
      await apiDeleteProductType(item.id);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }

  const visible = types.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <section className="admin-page">
      <div className="admin-card">
        <div className="admin-toolbar">
          <input aria-label="Buscar tipos de produto" placeholder="Buscar tipo" value={query} onChange={(e) => setQuery(e.target.value)} />
          {canEdit ? <button type="button" className="btn btn--primary" onClick={() => open()}>Novo tipo</button> : null}
        </div>
        <p className="empty">Como a loja separa os produtos: Smartphone, Acessório, Bebida, Serviço… Aparece no cadastro do produto e nos filtros.</p>
      </div>
      {message ? <p role="alert" className="qty-low">{message}</p> : null}
      {form ? (
        <form className="admin-card" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3>{readOnly ? 'Consultar tipo de produto' : form.id ? 'Editar tipo de produto' : 'Novo tipo de produto'}</h3>
          <div className="admin-form">
            <label>
              Nome
              <input autoFocus required maxLength={80} value={form.name} disabled={readOnly || saving} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <AdminPicker
              label="Situação"
              value={form.active ? 'active' : 'inactive'}
              options={[{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]}
              disabled={readOnly || saving}
              onChange={(value) => setForm({ ...form, active: value === 'active' })}
            />
          </div>
          <div className="admin-toolbar">
            {!readOnly ? <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar tipo'}</button> : null}
            <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setForm(null)}>{readOnly ? 'Fechar' : 'Cancelar'}</button>
          </div>
        </form>
      ) : null}
      <div className="admin-card admin-table-container">
        <table className="admin-table">
          <thead><tr><th>Tipo</th><th>Situação</th><th>Produtos</th><th>Ações</th></tr></thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td><CrudNameButton onClick={() => open(item, true)}>{item.name}</CrudNameButton></td>
                <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                <td>{item.productCount}</td>
                <td><CrudRowActions onView={() => open(item, true)} canEdit={canEdit} canDelete={canEdit} onEdit={() => open(item)} onDelete={() => void remove(item)} /></td>
              </tr>
            ))}
            {!visible.length ? <tr><td colSpan={4} className="empty">{loading ? 'Carregando…' : 'Nenhum tipo de produto cadastrado.'}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
