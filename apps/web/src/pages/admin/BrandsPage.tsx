import { useEffect, useState } from 'react';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import { createBrand, deleteBrand, updateBrand, useBrands, type Brand } from '../../data/brandStore';

export function BrandsPage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'manager', 'superadmin'].includes(user?.role ?? '');
  const { brands, loading, error, reload } = useBrands();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<{ id?: string; name: string; active: boolean } | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const changed = () => { setForm(null); setMessage(''); setQuery(''); };
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, []);
  function open(brand?: Brand, view = false, duplicate = false) {
    setMessage(''); setReadOnly(view);
    setForm(brand ? { id: duplicate ? undefined : brand.id, name: duplicate ? `${brand.name} (cópia)` : brand.name, active: brand.active } : { name: '', active: true });
  }
  async function save() {
    if (!form || saving) return;
    setSaving(true); setMessage('');
    try {
      const brand = form.id ? await updateBrand(form.id, form) : await createBrand(form.name);
      if (!form.id && !form.active) await updateBrand(brand.id, { active: false });
      setForm(null);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível salvar a marca.'); }
    finally { setSaving(false); }
  }
  async function remove(brand: Brand) {
    if (!confirmDelete(brand.name)) return;
    try { await deleteBrand(brand.id); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível excluir a marca.'); }
  }
  return (
    <section className="admin-page brands-page">
      <div className="admin-card"><div className="admin-toolbar">
        <input aria-label="Buscar marcas" placeholder="Buscar marca" value={query} onChange={e => setQuery(e.target.value)} />
        {canEdit && <button className="btn btn--primary" onClick={() => open()}>Nova marca</button>}
      </div>
      <p className="empty">Marcas disponíveis para os produtos desta loja.</p></div>
      {(message || error) && <p role="alert">{message || error} {error && <button className="btn btn--ghost" onClick={() => void reload()}>Tentar novamente</button>}</p>}
      {form && <form className="admin-card" onSubmit={e => { e.preventDefault(); void save(); }}>
        <h3>{readOnly ? 'Consultar marca' : form.id ? 'Editar marca' : 'Nova marca'}</h3>
        <div className="admin-form">
          <label>Nome da marca<input autoFocus required maxLength={80} value={form.name} disabled={readOnly || saving} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <AdminPicker label="Situação" value={form.active ? 'active' : 'inactive'} options={[{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }]} disabled={readOnly || saving} onChange={value => setForm({ ...form, active: value === 'active' })} />
        </div>
        <div className="admin-toolbar">
          {!readOnly && <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar marca'}</button>}
          <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setForm(null)}>{readOnly ? 'Fechar' : 'Cancelar'}</button>
        </div>
      </form>}
      <div className="admin-card admin-table-container">
        <table className="admin-table">
          <thead><tr><th>Marca</th><th>Situação</th><th>Produtos</th><th>Ações</th></tr></thead>
          <tbody>
            {brands.filter(b => b.name.toLowerCase().includes(query.toLowerCase())).map(brand => <tr key={brand.id}>
              <td><CrudNameButton onClick={() => open(brand, true)}>{brand.name}</CrudNameButton></td>
              <td>{brand.active ? 'Ativa' : 'Inativa'}</td><td>{brand.productCount}</td>
              <td><CrudRowActions onView={() => open(brand, true)} canEdit={canEdit} canDelete={canEdit} onEdit={() => open(brand)} onDuplicate={canEdit ? () => open(brand, false, true) : undefined} onDelete={() => void remove(brand)} /></td>
            </tr>)}
            {!brands.length && <tr><td colSpan={4} className="empty">{loading ? 'Carregando marcas…' : 'Nenhuma marca cadastrada.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
