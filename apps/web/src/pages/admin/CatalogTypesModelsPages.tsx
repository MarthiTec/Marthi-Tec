import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { UppercaseToggle, useUppercase } from '../../components/UppercaseToggle';
import { AdminPicker, CrudNameButton, CrudRowActions, HeadingFormActions, confirmDelete } from '../../design-system';
import { useBrands } from '../../data/brandStore';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import {
  apiCreateCatalogModel,
  apiCreateCatalogType,
  apiDeleteCatalogModel,
  apiDeleteCatalogType,
  apiListCatalogModelsAll,
  apiListCatalogTypesAll,
  apiUpdateCatalogModel,
  apiUpdateCatalogType,
  type CatalogModel,
  type CatalogType,
} from '../../services/productCatalogApi';
import './brandsPage.css';

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const PLATFORM_NOTE = 'Vem da base da plataforma: a alteração vale só para esta loja (as outras lojas continuam com o original).';

function useCanEdit() {
  const { user } = useAuth();
  return ['admin', 'manager', 'superadmin'].includes(user?.role ?? '');
}

/** Recarrega ao trocar de loja; devolve [lista, erro, carregando, recarregar]. */
function useCatalogList<T>(load: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = () => {
    setLoading(true);
    load()
      .then((list) => (setItems(list), setError('')))
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar.'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    reload();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, reload);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { items, setItems, error, loading, reload };
}

function useSaveShortcut(active: boolean, save: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

/** Marcas para o formulário; a marca da base que a loja não cadastrou aparece pelo nome (não pelo código). */
function formBrandOptions(brands: Array<{ slug: string; name: string }>, current: string) {
  const options = [{ value: '', label: 'Escolha a marca' }, ...brands.map((brand) => ({ value: brand.slug, label: brand.name }))];
  if (current && !brands.some((brand) => brand.slug === current)) options.push({ value: current, label: current.toUpperCase() });
  return options;
}

function Origin({ own }: { own: boolean }) {
  return <small className="catalog-origin">{own ? 'da loja' : 'base da plataforma'}</small>;
}

/* ── Tipos ─────────────────────────────────────────────────────────────── */

type TypeForm = { id?: string; own: boolean; brandSlug: string; name: string; active: boolean; originalName?: string };

export function CatalogTypesPage() {
  const canEdit = useCanEdit();
  const { brands } = useBrands();
  const { items: types, setItems, error, loading, reload } = useCatalogList<CatalogType>(apiListCatalogTypesAll);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [form, setForm] = useState<TypeForm | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { uppercase, setUppercase, upper } = useUppercase();
  const brandName = (slug: string) => brands.find((brand) => brand.slug === slug)?.name ?? slug.toUpperCase();

  function open(type?: CatalogType, view = false, duplicate = false) {
    setMessage('');
    setReadOnly(view);
    setForm(
      type
        ? { id: duplicate ? undefined : type.id, own: duplicate ? true : type.own, brandSlug: type.brandSlug, name: duplicate ? `${type.name} (CÓPIA)` : type.name, active: type.active !== false, originalName: duplicate ? undefined : type.originalName }
        : { own: true, brandSlug: brandFilter, name: '', active: true },
    );
  }
  async function save() {
    if (!form || saving || readOnly) return;
    if (!form.brandSlug) return setMessage('Escolha a marca.');
    if (!form.name.trim()) return setMessage('Informe o nome do tipo.');
    setSaving(true);
    setMessage('');
    try {
      if (form.id) {
        await apiUpdateCatalogType(form.id, { name: form.name, active: form.active, ...(form.own ? { brandSlug: form.brandSlug } : {}) });
      } else {
        const created = await apiCreateCatalogType({ brandSlug: form.brandSlug, name: form.name });
        if (!form.active) await apiUpdateCatalogType(created.id, { active: false });
      }
      setForm(null);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar o tipo.');
    } finally {
      setSaving(false);
    }
  }
  async function remove(type: CatalogType) {
    try {
      if (!type.own) {
        if (!window.confirm(`"${type.name}" é da base da plataforma e não pode ser excluído. Inativar só nesta loja?`)) return;
        const updated = await apiUpdateCatalogType(type.id, { active: false });
        setItems((list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        return;
      }
      if (!confirmDelete(type.name)) return;
      await apiDeleteCatalogType(type.id);
      setItems((list) => list.filter((item) => item.id !== type.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível excluir o tipo.');
    }
  }
  useSaveShortcut(Boolean(form) && !readOnly, () => void save());

  const filtered = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    return types
      .filter((type) => {
        if (brandFilter && type.brandSlug !== brandFilter) return false;
        const text = plain(`${type.name} ${type.originalName ?? ''} ${brandName(type.brandSlug)}`);
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => collator.compare(brandName(a.brandSlug), brandName(b.brandSlug)) || a.sort - b.sort || collator.compare(a.name, b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types, query, brandFilter, brands]);
  const brandOptions = [{ value: '', label: 'Todas as marcas' }, ...brands.map((brand) => ({ value: brand.slug, label: brand.name }))];

  return (
    <section className="admin-page brands-page">
      <HeadingFormActions
        mode={!form ? 'list' : readOnly ? 'view' : 'edit'}
        onNew={canEdit ? () => open() : undefined}
        onClose={() => setForm(null)}
        onEdit={canEdit ? () => setReadOnly(false) : undefined}
        onSave={() => void save()}
        saving={saving}
        newLabel="Novo tipo"
        saveLabel={saving ? 'Salvando…' : 'Salvar'}
        items={filtered}
        currentId={form?.id}
        onOpen={(type) => open(type, true)}
      />
      <div className="admin-card">
        <div className="admin-toolbar">
          <input aria-label="Buscar tipos" placeholder="Buscar tipo" value={query} onChange={(e) => setQuery(e.target.value)} />
          <AdminPicker label="" value={brandFilter} searchable options={brandOptions} onChange={setBrandFilter} />
        </div>
        <p className="empty">Tipos (linhas) de cada marca. No cadastro do produto, Marca → Tipo → Modelo monta a descrição.</p>
      </div>
      {(message || error) && <p role="alert">{message || error}</p>}
      {form && (
        <form className="admin-card" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3>{readOnly ? 'Consultar tipo' : form.id ? 'Editar tipo' : 'Novo tipo'}</h3>
          {!form.own && form.id ? <p className="catalog-note">{PLATFORM_NOTE}{form.originalName && form.originalName !== form.name ? ` Nome original: ${form.originalName}.` : ''}</p> : null}
          <div className="admin-form">
            <UppercaseToggle checked={uppercase} disabled={readOnly || saving} onChange={setUppercase} />
            <AdminPicker
              label="Marca"
              value={form.brandSlug}
              searchable
              disabled={readOnly || saving || (!form.own && Boolean(form.id))}
              options={formBrandOptions(brands, form.brandSlug)}
              onChange={(brandSlug) => setForm({ ...form, brandSlug })}
            />
            <label>
              Nome do tipo
              <input autoFocus required maxLength={60} placeholder="Ex.: GALAXY A" value={form.name} disabled={readOnly || saving} onChange={(e) => setForm({ ...form, name: upper(e.target.value) })} />
            </label>
            <AdminPicker label="Situação" value={form.active ? 'active' : 'inactive'} options={[{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]} disabled={readOnly || saving} onChange={(value) => setForm({ ...form, active: value === 'active' })} />
          </div>
        </form>
      )}
      {!form ? (
        <div className="admin-card admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Modelos</th>
                <th>Produtos</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((type) => (
                <tr key={type.id} className={type.active === false ? 'is-inactive' : ''}>
                  <td data-label="Tipo">
                    <span className="catalog-name">
                      <CrudNameButton onClick={() => open(type, true)}>{type.name}</CrudNameButton>
                      <Origin own={type.own} />
                    </span>
                  </td>
                  <td data-label="Marca">{brandName(type.brandSlug)}</td>
                  <td data-label="Modelos">{type.modelCount ?? 0}</td>
                  <td data-label="Produtos">{type.productCount ?? 0}</td>
                  <td data-label="Situação">{type.active === false ? 'Inativo' : 'Ativo'}</td>
                  <td>
                    <CrudRowActions onView={() => open(type, true)} canEdit={canEdit} canDelete={canEdit} onEdit={() => open(type)} onDuplicate={canEdit ? () => open(type, false, true) : undefined} onDelete={() => void remove(type)} />
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="empty">{loading ? 'Carregando tipos…' : types.length ? 'Nenhum tipo com esse filtro.' : 'Nenhum tipo cadastrado.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/* ── Modelos ───────────────────────────────────────────────────────────── */

type ModelForm = { id?: string; own: boolean; brandSlug: string; typeId: string; name: string; active: boolean; originalName?: string };

export function CatalogModelsPage() {
  const canEdit = useCanEdit();
  const { brands } = useBrands();
  const { items: models, setItems, error, loading, reload } = useCatalogList<CatalogModel>(apiListCatalogModelsAll);
  const [types, setTypes] = useState<CatalogType[]>([]);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState<ModelForm | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const { uppercase, setUppercase, upper } = useUppercase();

  useEffect(() => {
    const load = () => apiListCatalogTypesAll().then(setTypes).catch(() => setTypes([]));
    void load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, []);
  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);
  const brandName = (slug: string) => brands.find((brand) => brand.slug === slug)?.name ?? slug.toUpperCase();
  const typesOf = (slug: string) => types.filter((type) => !slug || type.brandSlug === slug);

  function open(model?: CatalogModel, view = false, duplicate = false) {
    setMessage('');
    setReadOnly(view);
    if (!model) {
      const type = typeById.get(typeFilter);
      setForm({ own: true, brandSlug: type?.brandSlug ?? brandFilter, typeId: typeFilter, name: '', active: true });
      return;
    }
    setForm({
      id: duplicate ? undefined : model.id,
      own: duplicate ? true : model.own,
      brandSlug: typeById.get(model.typeId)?.brandSlug ?? '',
      typeId: model.typeId,
      name: duplicate ? `${model.name} (CÓPIA)` : model.name,
      active: model.active !== false,
      originalName: duplicate ? undefined : model.originalName,
    });
  }
  async function save() {
    if (!form || saving || readOnly) return;
    if (!form.typeId) return setMessage('Escolha o tipo.');
    if (!form.name.trim()) return setMessage('Informe o nome do modelo.');
    setSaving(true);
    setMessage('');
    try {
      if (form.id) {
        await apiUpdateCatalogModel(form.id, { name: form.name, active: form.active, ...(form.own ? { typeId: form.typeId } : {}) });
      } else {
        const created = await apiCreateCatalogModel({ typeId: form.typeId, name: form.name });
        if (!form.active) await apiUpdateCatalogModel(created.id, { active: false });
      }
      setForm(null);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar o modelo.');
    } finally {
      setSaving(false);
    }
  }
  async function remove(model: CatalogModel) {
    try {
      if (!model.own) {
        if (!window.confirm(`"${model.name}" é da base da plataforma e não pode ser excluído. Inativar só nesta loja?`)) return;
        const updated = await apiUpdateCatalogModel(model.id, { active: false });
        setItems((list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
        return;
      }
      if (!confirmDelete(model.name)) return;
      await apiDeleteCatalogModel(model.id);
      setItems((list) => list.filter((item) => item.id !== model.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível excluir o modelo.');
    }
  }
  useSaveShortcut(Boolean(form) && !readOnly, () => void save());

  const filtered = useMemo(() => {
    const words = plain(query).split(/\s+/).filter(Boolean);
    const key = (model: CatalogModel) => {
      const type = typeById.get(model.typeId);
      return [type ? brandName(type.brandSlug) : '', type?.name ?? ''] as const;
    };
    return models
      .filter((model) => {
        const type = typeById.get(model.typeId);
        if (typeFilter && model.typeId !== typeFilter) return false;
        if (brandFilter && type?.brandSlug !== brandFilter) return false;
        const text = plain(`${model.name} ${model.originalName ?? ''} ${type?.name ?? ''} ${type ? brandName(type.brandSlug) : ''}`);
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => {
        const [brandA, typeA] = key(a);
        const [brandB, typeB] = key(b);
        return collator.compare(brandA, brandB) || collator.compare(typeA, typeB) || collator.compare(a.name, b.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, query, brandFilter, typeFilter, typeById, brands]);

  const brandOptions = [{ value: '', label: 'Todas as marcas' }, ...brands.map((brand) => ({ value: brand.slug, label: brand.name }))];
  const typeOptions = (slug: string, empty: string) => [{ value: '', label: empty }, ...typesOf(slug).map((type) => ({ value: type.id, label: slug ? type.name : `${brandName(type.brandSlug)} › ${type.name}` }))];

  return (
    <section className="admin-page brands-page">
      <HeadingFormActions
        mode={!form ? 'list' : readOnly ? 'view' : 'edit'}
        onNew={canEdit ? () => open() : undefined}
        onClose={() => setForm(null)}
        onEdit={canEdit ? () => setReadOnly(false) : undefined}
        onSave={() => void save()}
        saving={saving}
        newLabel="Novo modelo"
        saveLabel={saving ? 'Salvando…' : 'Salvar'}
        items={filtered}
        currentId={form?.id}
        onOpen={(model) => open(model, true)}
      />
      <div className="admin-card">
        <div className="admin-toolbar">
          <input aria-label="Buscar modelos" placeholder="Buscar modelo" value={query} onChange={(e) => setQuery(e.target.value)} />
          <AdminPicker label="" value={brandFilter} searchable options={brandOptions} onChange={(value) => (setBrandFilter(value), setTypeFilter(''))} />
          {/* Marca → Tipo: o tipo só lista depois de escolher a marca. */}
          <AdminPicker label="" value={typeFilter} searchable disabled={!brandFilter} options={typeOptions(brandFilter, brandFilter ? 'Todos os tipos' : 'Escolha a marca para filtrar o tipo')} onChange={setTypeFilter} />
        </div>
        <p className="empty">Modelos de cada tipo. Aparecem no cadastro simplificado do produto (Marca → Tipo → Modelo).</p>
      </div>
      {(message || error) && <p role="alert">{message || error}</p>}
      {form && (
        <form className="admin-card" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3>{readOnly ? 'Consultar modelo' : form.id ? 'Editar modelo' : 'Novo modelo'}</h3>
          {!form.own && form.id ? <p className="catalog-note">{PLATFORM_NOTE}{form.originalName && form.originalName !== form.name ? ` Nome original: ${form.originalName}.` : ''}</p> : null}
          <div className="admin-form">
            <UppercaseToggle checked={uppercase} disabled={readOnly || saving} onChange={setUppercase} />
            <AdminPicker
              label="Marca"
              value={form.brandSlug}
              searchable
              disabled={readOnly || saving || (!form.own && Boolean(form.id))}
              options={formBrandOptions(brands, form.brandSlug)}
              onChange={(brandSlug) => setForm({ ...form, brandSlug, typeId: '' })}
            />
            <AdminPicker
              label="Tipo"
              value={form.typeId}
              searchable
              disabled={readOnly || saving || !form.brandSlug || (!form.own && Boolean(form.id))}
              options={typeOptions(form.brandSlug, form.brandSlug ? 'Escolha o tipo' : 'Escolha a marca primeiro')}
              onChange={(typeId) => setForm({ ...form, typeId, brandSlug: typeById.get(typeId)?.brandSlug ?? form.brandSlug })}
            />
            <label>
              Nome do modelo
              <input autoFocus required maxLength={60} placeholder="Ex.: A15" value={form.name} disabled={readOnly || saving} onChange={(e) => setForm({ ...form, name: upper(e.target.value) })} />
            </label>
            <AdminPicker label="Situação" value={form.active ? 'active' : 'inactive'} options={[{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]} disabled={readOnly || saving} onChange={(value) => setForm({ ...form, active: value === 'active' })} />
          </div>
        </form>
      )}
      {!form ? (
        <div className="admin-card admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Tipo</th>
                <th>Marca</th>
                <th>Produtos</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((model) => {
                const type = typeById.get(model.typeId);
                return (
                  <tr key={model.id} className={model.active === false ? 'is-inactive' : ''}>
                    <td data-label="Modelo">
                      <span className="catalog-name">
                        <CrudNameButton onClick={() => open(model, true)}>{model.name}</CrudNameButton>
                        <Origin own={model.own} />
                      </span>
                    </td>
                    <td data-label="Tipo">{type?.name ?? '—'}</td>
                    <td data-label="Marca">{type ? brandName(type.brandSlug) : '—'}</td>
                    <td data-label="Produtos">{model.productCount ?? 0}</td>
                    <td data-label="Situação">{model.active === false ? 'Inativo' : 'Ativo'}</td>
                    <td>
                      <CrudRowActions onView={() => open(model, true)} canEdit={canEdit} canDelete={canEdit} onEdit={() => open(model)} onDuplicate={canEdit ? () => open(model, false, true) : undefined} onDelete={() => void remove(model)} />
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="empty">{loading ? 'Carregando modelos…' : models.length ? 'Nenhum modelo com esse filtro.' : 'Nenhum modelo cadastrado.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
