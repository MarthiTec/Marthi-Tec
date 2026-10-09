import { useCallback, useEffect, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import { useAuth } from '../../contexts/AuthContext';
import { userIsStoreAdmin } from '../../data/erpRegistry';
import { hubFullAccess } from '../../data/hubPaths';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import {
  apiCreateProductGroup,
  apiDeleteProductGroup,
  apiListProductGroups,
  apiSaveProductGroupLabels,
  apiUpdateProductGroup,
  type ProductGroup,
  type ProductGroupLabels,
} from '../../services/productCatalogApi';

type Form = { id?: string; name: string; parentId: string; active: boolean };

/**
 * Grupos e subgrupos de produtos (ex.: Bebidas › Cerveja, Eletrônicos › Celular). A loja escolhe
 * como chamar cada nível — Grupo/Subgrupo por padrão, ou Família, Categoria, Linha…
 */
export function ProductGroupsPage() {
  const { user } = useAuth();
  const canEdit = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [labels, setLabels] = useState<ProductGroupLabels>({ group: 'Grupo', subgroup: 'Subgrupo' });
  const [labelForm, setLabelForm] = useState<ProductGroupLabels>({ group: 'Grupo', subgroup: 'Subgrupo' });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListProductGroups();
      setGroups(data.groups);
      setLabels(data.labels);
      setLabelForm(data.labels);
      setMessage('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível carregar os grupos.');
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

  const parents = groups.filter((item) => !item.parentId);
  const childrenOf = (id: string) => groups.filter((item) => item.parentId === id);

  function open(item?: ProductGroup, view = false, parentId = '') {
    setMessage('');
    setNotice('');
    setReadOnly(view);
    setForm(item ? { id: item.id, name: item.name, parentId: item.parentId ?? '', active: item.active } : { name: '', parentId, active: true });
  }

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const body = { name: form.name, parentId: form.parentId || null, active: form.active };
      if (form.id) await apiUpdateProductGroup(form.id, body);
      else await apiCreateProductGroup(body);
      setForm(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function saveLabels() {
    setSaving(true);
    setMessage('');
    try {
      const saved = await apiSaveProductGroupLabels(labelForm);
      setLabels(saved);
      setLabelForm(saved);
      setNotice(`Pronto: os níveis agora se chamam ${saved.group} e ${saved.subgroup}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar os nomes.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ProductGroup) {
    const subs = childrenOf(item.id).length;
    if (!confirmDelete(subs ? `${item.name} e seus ${subs} ${labels.subgroup.toLowerCase()}(s)` : item.name)) return;
    try {
      await apiDeleteProductGroup(item.id);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }

  const q = query.trim().toLowerCase();
  const matches = (item: ProductGroup) => !q || item.name.toLowerCase().includes(q);
  const visibleParents = parents.filter((item) => matches(item) || childrenOf(item.id).some(matches));
  const labelsChanged = labelForm.group.trim() !== labels.group || labelForm.subgroup.trim() !== labels.subgroup;

  const row = (item: ProductGroup, child: boolean) => (
    <tr key={item.id} className={child ? 'product-groups__child' : undefined}>
      <td>
        <span className="product-groups__name">
          {child ? <span aria-hidden="true" className="product-groups__branch">└</span> : null}
          <CrudNameButton onClick={() => open(item, true)}>{item.name}</CrudNameButton>
        </span>
      </td>
      <td>{child ? labels.subgroup : labels.group}</td>
      <td>{item.active ? 'Ativo' : 'Inativo'}</td>
      <td>{item.productCount}</td>
      <td>
        <span className="product-groups__actions">
          {!child && canEdit ? (
            <button type="button" className="btn btn--ghost btn--xs" onClick={() => open(undefined, false, item.id)}>+ {labels.subgroup}</button>
          ) : null}
          <CrudRowActions onView={() => open(item, true)} canEdit={canEdit} canDelete={canEdit} onEdit={() => open(item)} onDelete={() => void remove(item)} />
        </span>
      </td>
    </tr>
  );

  return (
    <section className="admin-page product-groups">
      <div className="admin-card">
        <div className="admin-toolbar">
          <input aria-label={`Buscar ${labels.group.toLowerCase()}`} placeholder={`Buscar ${labels.group.toLowerCase()} ou ${labels.subgroup.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
          {canEdit ? <button type="button" className="btn btn--primary" onClick={() => open()}>Novo {labels.group.toLowerCase()}</button> : null}
        </div>
        <p className="empty">
          Organize os produtos em dois níveis. Ex.: <strong>Bebidas</strong> › Cerveja, Refrigerante, Sucos · <strong>Eletrônicos</strong> › Celular, Fone.
        </p>
      </div>

      {canEdit ? (
        <div className="admin-card">
          <h3>Como chamar cada nível</h3>
          <p className="empty">Tem loja que chama de Família, Categoria ou Departamento. O nome escolhido aparece aqui e no cadastro do produto.</p>
          <div className="admin-form">
            <label>
              Primeiro nível
              <input maxLength={30} value={labelForm.group} placeholder="Grupo" onChange={(e) => setLabelForm({ ...labelForm, group: e.target.value })} />
            </label>
            <label>
              Segundo nível
              <input maxLength={30} value={labelForm.subgroup} placeholder="Subgrupo" onChange={(e) => setLabelForm({ ...labelForm, subgroup: e.target.value })} />
            </label>
          </div>
          <div className="admin-toolbar">
            <button type="button" className="btn btn--primary" disabled={saving || !labelsChanged || !labelForm.group.trim() || !labelForm.subgroup.trim()} onClick={() => void saveLabels()}>
              Salvar nomes
            </button>
            {labels.group !== 'Grupo' || labels.subgroup !== 'Subgrupo' ? (
              <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setLabelForm({ group: 'Grupo', subgroup: 'Subgrupo' })}>
                Voltar ao padrão
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <p role="alert" className="qty-low">{message}</p> : null}
      {notice ? <p role="status" className="brands-page__notice">{notice}</p> : null}

      {form ? (
        <form className="admin-card" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3>
            {readOnly ? 'Consultar' : form.id ? 'Editar' : 'Novo'} {(form.parentId ? labels.subgroup : labels.group).toLowerCase()}
          </h3>
          <div className="admin-form">
            <label>
              Nome
              <input autoFocus required maxLength={80} value={form.name} disabled={readOnly || saving} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <AdminPicker
              label={`Dentro de qual ${labels.group.toLowerCase()}`}
              value={form.parentId}
              disabled={readOnly || saving || (form.id ? childrenOf(form.id).length > 0 : false)}
              options={[
                { value: '', label: `Nenhum — é um ${labels.group.toLowerCase()}` },
                ...parents.filter((item) => item.id !== form.id).map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(parentId) => setForm({ ...form, parentId })}
            />
            <AdminPicker
              label="Situação"
              value={form.active ? 'active' : 'inactive'}
              options={[{ value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]}
              disabled={readOnly || saving}
              onChange={(value) => setForm({ ...form, active: value === 'active' })}
            />
          </div>
          <div className="admin-toolbar">
            {!readOnly ? <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button> : null}
            <button type="button" className="btn btn--ghost" disabled={saving} onClick={() => setForm(null)}>{readOnly ? 'Fechar' : 'Cancelar'}</button>
          </div>
        </form>
      ) : null}

      <div className="admin-card admin-table-container">
        <table className="admin-table">
          <thead><tr><th>Nome</th><th>Nível</th><th>Situação</th><th>Produtos</th><th>Ações</th></tr></thead>
          <tbody>
            {visibleParents.flatMap((parent) => [
              row(parent, false),
              ...childrenOf(parent.id).filter((child) => matches(parent) || matches(child)).map((child) => row(child, true)),
            ])}
            {!visibleParents.length ? (
              <tr><td colSpan={5} className="empty">{loading ? 'Carregando…' : `Nenhum ${labels.group.toLowerCase()} cadastrado.`}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
