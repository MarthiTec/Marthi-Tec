import { useEffect, useState } from 'react';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { useAuth } from '../../contexts/AuthContext';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import { autoBrandLogo, autoFillBrandLogos, createBrand, deleteBrand, updateBrand, useBrands, type Brand } from '../../data/brandStore';
import { fileToStoreLogo } from '../../data/totemSettings';
import { TotemSettingsImage } from './TotemSettingsControls';
import './brandsPage.css';

type BrandForm = { id?: string; name: string; active: boolean; logo: string | null };

/** Ícone da marca; sem ícone, mostra a inicial. */
function BrandIcon({ brand }: { brand: Pick<Brand, 'name' | 'logo'> }) {
  return (
    <span className="brand-icon" aria-hidden="true">
      {brand.logo ? <img src={brand.logo} alt="" /> : brand.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function BrandsPage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'manager', 'superadmin'].includes(user?.role ?? '');
  const { brands, loading, error, reload } = useBrands();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<BrandForm | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingIcon, setFetchingIcon] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const changed = () => { setForm(null); setMessage(''); setNotice(''); setQuery(''); };
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, []);
  function open(brand?: Brand, view = false, duplicate = false) {
    setMessage(''); setNotice(''); setReadOnly(view);
    setForm(brand
      ? { id: duplicate ? undefined : brand.id, name: duplicate ? `${brand.name} (cópia)` : brand.name, active: brand.active, logo: brand.logo ?? null }
      : { name: '', active: true, logo: null });
  }
  async function save() {
    if (!form || saving) return;
    setSaving(true); setMessage('');
    try {
      if (form.id) {
        await updateBrand(form.id, { name: form.name, active: form.active, logo: form.logo });
      } else {
        // A marca nova já tenta buscar o ícone padrão no servidor; o enviado pela loja tem prioridade.
        const brand = await createBrand(form.name);
        if (form.logo || !form.active) await updateBrand(brand.id, { ...(form.logo ? { logo: form.logo } : {}), active: form.active });
      }
      setForm(null);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível salvar a marca.'); }
    finally { setSaving(false); }
  }
  async function fetchIcon() {
    if (!form?.id || fetchingIcon) return;
    setFetchingIcon(true); setMessage('');
    try {
      const brand = await autoBrandLogo(form.id);
      setForm((current) => (current ? { ...current, logo: brand.logo ?? null } : current));
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível buscar o ícone.'); }
    finally { setFetchingIcon(false); }
  }
  async function fillAll() {
    if (bulkBusy) return;
    setBulkBusy(true); setMessage(''); setNotice('');
    try {
      const { found, missing } = await autoFillBrandLogos();
      setNotice([
        found.length ? `Ícone encontrado: ${found.join(', ')}.` : 'Nenhum ícone novo encontrado.',
        missing.length ? `Sem ícone automático (envie a imagem): ${missing.join(', ')}.` : '',
      ].filter(Boolean).join(' '));
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível buscar os ícones.'); }
    finally { setBulkBusy(false); }
  }
  async function remove(brand: Brand) {
    if (!confirmDelete(brand.name)) return;
    try { await deleteBrand(brand.id); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Não foi possível excluir a marca.'); }
  }
  const withoutIcon = brands.filter((brand) => !brand.logo).length;
  return (
    <section className="admin-page brands-page">
      <div className="admin-card"><div className="admin-toolbar">
        <input aria-label="Buscar marcas" placeholder="Buscar marca" value={query} onChange={e => setQuery(e.target.value)} />
        {canEdit && withoutIcon > 0 ? (
          <button type="button" className="btn btn--ghost" disabled={bulkBusy} onClick={() => void fillAll()}>
            {bulkBusy ? 'Buscando ícones…' : `Buscar ícones automaticamente (${withoutIcon})`}
          </button>
        ) : null}
        {canEdit && <button className="btn btn--primary" onClick={() => open()}>Nova marca</button>}
      </div>
      <p className="empty">Marcas disponíveis para os produtos desta loja. O ícone aparece na vitrine do totem (barra lateral e abas do topo).</p></div>
      {(message || error) && <p role="alert">{message || error} {error && <button className="btn btn--ghost" onClick={() => void reload()}>Tentar novamente</button>}</p>}
      {notice && <p role="status" className="brands-page__notice">{notice}</p>}
      {form && <form className="admin-card" onSubmit={e => { e.preventDefault(); void save(); }}>
        <h3>{readOnly ? 'Consultar marca' : form.id ? 'Editar marca' : 'Nova marca'}</h3>
        <div className="admin-form">
          <label>Nome da marca<input autoFocus required maxLength={80} value={form.name} disabled={readOnly || saving} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <AdminPicker label="Situação" value={form.active ? 'active' : 'inactive'} options={[{ value: 'active', label: 'Ativa' }, { value: 'inactive', label: 'Inativa' }]} disabled={readOnly || saving} onChange={value => setForm({ ...form, active: value === 'active' })} />
        </div>
        {readOnly ? (
          <div className="brands-page__icon-view"><BrandIcon brand={form} /> {form.logo ? 'Ícone cadastrado' : 'Sem ícone'}</div>
        ) : (
          <div className="brands-page__icon-edit">
            <TotemSettingsImage
              label="Ícone da marca"
              hint={form.id ? 'Envie o logo (PNG com fundo transparente fica melhor) ou busque o ícone padrão pelo nome.' : 'Opcional: ao salvar, buscamos o ícone padrão pelo nome. Se quiser, envie o seu.'}
              value={form.logo}
              convert={fileToStoreLogo}
              onChange={(logo) => setForm({ ...form, logo })}
            />
            {form.id ? (
              <button type="button" className="btn btn--ghost" disabled={fetchingIcon || saving} onClick={() => void fetchIcon()}>
                {fetchingIcon ? 'Buscando…' : 'Buscar ícone padrão pelo nome'}
              </button>
            ) : null}
          </div>
        )}
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
              <td><span className="brands-page__name"><BrandIcon brand={brand} /><CrudNameButton onClick={() => open(brand, true)}>{brand.name}</CrudNameButton></span></td>
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
