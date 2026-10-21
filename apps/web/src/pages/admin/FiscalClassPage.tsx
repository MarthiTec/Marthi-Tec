import { useContext, useEffect, useState } from 'react';
import {
  AdminPicker,
  CrudNameButton,
  CrudRowActions,
  HeadingFormActions,
  confirmDelete,
  InlineHeadingActions,
} from '../../design-system';
import {
  listCfops,
  listFiscalClassifications,
  upsertFiscalClassification,
  type FiscalClassification,
} from '../../data/fiscalCatalog';

const EMPTY = {
  name: '',
  ncm: '',
  cstIcms: '00',
  cClasTrib: '',
  icmsRate: 18,
  ipiCst: '99',
  ipiRate: 0,
  pisCst: '01',
  pisRate: 1.65,
  cofinsCst: '01',
  cofinsRate: 7.6,
  ibsRate: 0,
  cbsRate: 0,
  defaultCfopId: '',
  notes: '',
  active: true,
};

export function FiscalClassPage() {
  const [items, setItems] = useState(() => listFiscalClassifications());
  const [cfops] = useState(() => listCfops(true));
  const [form, setForm] = useState({ ...EMPTY, defaultCfopId: cfops[0]?.id ?? '' });
  const [editingId, setEditingId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving || readOnly) return;
    setSaving(true);
    setError('');
    try {
      const result = await upsertFiscalClassification({ ...form, id: editingId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems(listFiscalClassifications());
      clearForm();
    } finally {
      setSaving(false);
    }
  }

  function open(item?: FiscalClassification, view = false, duplicate = false) {
    setError('');
    setReadOnly(view);
    setFormOpen(true);
    if (!item) {
      setEditingId(undefined);
      setForm({ ...EMPTY, defaultCfopId: cfops[0]?.id ?? '' });
      return;
    }
    setEditingId(duplicate ? undefined : item.id);
    setForm({
      name: duplicate ? `${item.name} (cópia)` : item.name,
      ncm: item.ncm,
      cstIcms: item.cstIcms,
      cClasTrib: item.cClasTrib,
      icmsRate: item.icmsRate,
      ipiCst: item.ipiCst,
      ipiRate: item.ipiRate,
      pisCst: item.pisCst,
      pisRate: item.pisRate,
      cofinsCst: item.cofinsCst,
      cofinsRate: item.cofinsRate,
      ibsRate: item.ibsRate,
      cbsRate: item.cbsRate,
      defaultCfopId: item.defaultCfopId,
      notes: item.notes,
      active: item.active,
    });
  }

  function clearForm() {
    setEditingId(undefined);
    setFormOpen(false);
    setReadOnly(false);
    setForm({ ...EMPTY, defaultCfopId: cfops[0]?.id ?? '' });
    setError('');
  }

  async function remove(item: FiscalClassification) {
    if (!confirmDelete(item.name)) return;
    // Sem endpoint de exclusão: inativa o registro (mesmo campo do formulário).
    const result = await upsertFiscalClassification({
      id: item.id,
      name: item.name,
      ncm: item.ncm,
      cstIcms: item.cstIcms,
      cClasTrib: item.cClasTrib,
      icmsRate: item.icmsRate,
      ipiCst: item.ipiCst,
      ipiRate: item.ipiRate,
      pisCst: item.pisCst,
      pisRate: item.pisRate,
      cofinsCst: item.cofinsCst,
      cofinsRate: item.cofinsRate,
      ibsRate: item.ibsRate,
      cbsRate: item.cbsRate,
      defaultCfopId: item.defaultCfopId,
      notes: item.notes,
      active: false,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems(listFiscalClassifications());
    if (editingId === item.id) clearForm();
  }

  const formMode = !formOpen ? 'list' : readOnly ? 'view' : 'edit';
  const inline = useContext(InlineHeadingActions);

  useEffect(() => {
    if (inline || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="admin-page">
      <HeadingFormActions
        mode={formMode}
        onNew={() => open()}
        onClose={clearForm}
        onEdit={() => setReadOnly(false)}
        onSave={() => void submit()}
        saving={saving}
        newLabel="Nova classificação"
        saveLabel={saving ? 'Salvando…' : editingId ? 'Salvar' : 'Cadastrar'}
        items={items}
        currentId={editingId}
        onOpen={(row) => open(row, true)}
      />
      {formOpen ? (
        <article className="admin-card">
          <h2>
            {readOnly
              ? 'Consultar classificação fiscal'
              : editingId
                ? 'Editar classificação fiscal'
                : 'Nova classificação fiscal'}
          </h2>
          <p>
            Tabela separada do produto: NCM, CST, CClasTrib, ICMS, IPI, PIS, Cofins e campos da reforma
            (IBS / CBS). Vincule no cadastro do produto.
          </p>
          {error ? <p className="qty-low">{error}</p> : null}
          <div className="admin-form">
            <label className="span-2">
              Nome
              <input
                value={form.name}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              NCM
              <input
                value={form.ncm}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, ncm: e.target.value })}
              />
            </label>
            <label>
              CST ICMS
              <input
                value={form.cstIcms}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, cstIcms: e.target.value })}
              />
            </label>
            <label>
              CClasTrib
              <input
                value={form.cClasTrib}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, cClasTrib: e.target.value })}
              />
            </label>
            <label>
              ICMS %
              <input
                type="number"
                value={form.icmsRate}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, icmsRate: Number(e.target.value) })}
              />
            </label>
            <label>
              IPI CST
              <input
                value={form.ipiCst}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, ipiCst: e.target.value })}
              />
            </label>
            <label>
              IPI %
              <input
                type="number"
                value={form.ipiRate}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, ipiRate: Number(e.target.value) })}
              />
            </label>
            <label>
              PIS CST
              <input
                value={form.pisCst}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, pisCst: e.target.value })}
              />
            </label>
            <label>
              PIS %
              <input
                type="number"
                value={form.pisRate}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, pisRate: Number(e.target.value) })}
              />
            </label>
            <label>
              Cofins CST
              <input
                value={form.cofinsCst}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, cofinsCst: e.target.value })}
              />
            </label>
            <label>
              Cofins %
              <input
                type="number"
                value={form.cofinsRate}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, cofinsRate: Number(e.target.value) })}
              />
            </label>
            <label>
              IBS % (reforma)
              <input
                type="number"
                value={form.ibsRate}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, ibsRate: Number(e.target.value) })}
              />
            </label>
            <label>
              CBS % (reforma)
              <input
                type="number"
                value={form.cbsRate}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, cbsRate: Number(e.target.value) })}
              />
            </label>
            <AdminPicker
              label="CFOP padrão"
              value={form.defaultCfopId}
              placeholder="Nenhum"
              disabled={readOnly || saving}
              options={cfops.map((item) => ({
                value: item.id,
                label: `${item.code} — ${item.description}`,
              }))}
              onChange={(value) => setForm({ ...form, defaultCfopId: value })}
            />
            <AdminPicker
              label="Situação"
              value={form.active ? '1' : '0'}
              disabled={readOnly || saving}
              options={[
                { value: '1', label: 'Ativa' },
                { value: '0', label: 'Inativa' },
              ]}
              onChange={(value) => setForm({ ...form, active: value === '1' })}
            />
            <label className="span-2">
              Observações
              <input
                value={form.notes}
                disabled={readOnly || saving}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
        </article>
      ) : null}

      {!formOpen ? (
        <article className="admin-card">
          <h2>Classificações</h2>
          {error ? <p className="qty-low">{error}</p> : null}
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>NCM</th>
                  <th>CST</th>
                  <th>ICMS</th>
                  <th>IBS/CBS</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: 130 }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      Nenhuma classificação cadastrada.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <CrudNameButton onClick={() => open(item, true)}>
                          <strong>{item.name}</strong>
                        </CrudNameButton>
                      </td>
                      <td>{item.ncm}</td>
                      <td>{item.cstIcms}</td>
                      <td>{item.icmsRate}%</td>
                      <td>
                        {item.ibsRate}% / {item.cbsRate}%
                      </td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => open(item, true)}
                          onEdit={() => open(item)}
                          onDuplicate={() => open(item, false, true)}
                          onDelete={() => void remove(item)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
