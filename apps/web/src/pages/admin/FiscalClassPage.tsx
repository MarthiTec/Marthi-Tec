import { useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudIconButton } from '../../components/CrudKit';
import {
  listCfops,
  listFiscalClassifications,
  upsertFiscalClassification,
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
  const [error, setError] = useState('');

  async function submit() {
    const result = await upsertFiscalClassification({ ...form, id: editingId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems(listFiscalClassifications());
    setForm({ ...EMPTY, defaultCfopId: cfops[0]?.id ?? '' });
    setEditingId(undefined);
    setError('');
  }

  function edit(id: string) {
    const item = items.find((row) => row.id === id);
    if (!item) return;
    setEditingId(item.id);
    setForm({
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
      active: item.active,
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Editar classificação fiscal' : 'Nova classificação fiscal'}</h2>
        <p>
          Tabela separada do produto: NCM, CST, CClasTrib, ICMS, IPI, PIS, Cofins e campos da reforma
          (IBS / CBS). Vincule no cadastro do produto.
        </p>
        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-form">
          <label className="span-2">
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            NCM
            <input value={form.ncm} onChange={(e) => setForm({ ...form, ncm: e.target.value })} />
          </label>
          <label>
            CST ICMS
            <input
              value={form.cstIcms}
              onChange={(e) => setForm({ ...form, cstIcms: e.target.value })}
            />
          </label>
          <label>
            CClasTrib
            <input
              value={form.cClasTrib}
              onChange={(e) => setForm({ ...form, cClasTrib: e.target.value })}
            />
          </label>
          <label>
            ICMS %
            <input
              type="number"
              value={form.icmsRate}
              onChange={(e) => setForm({ ...form, icmsRate: Number(e.target.value) })}
            />
          </label>
          <label>
            IPI CST
            <input value={form.ipiCst} onChange={(e) => setForm({ ...form, ipiCst: e.target.value })} />
          </label>
          <label>
            IPI %
            <input
              type="number"
              value={form.ipiRate}
              onChange={(e) => setForm({ ...form, ipiRate: Number(e.target.value) })}
            />
          </label>
          <label>
            PIS CST
            <input value={form.pisCst} onChange={(e) => setForm({ ...form, pisCst: e.target.value })} />
          </label>
          <label>
            PIS %
            <input
              type="number"
              value={form.pisRate}
              onChange={(e) => setForm({ ...form, pisRate: Number(e.target.value) })}
            />
          </label>
          <label>
            Cofins CST
            <input
              value={form.cofinsCst}
              onChange={(e) => setForm({ ...form, cofinsCst: e.target.value })}
            />
          </label>
          <label>
            Cofins %
            <input
              type="number"
              value={form.cofinsRate}
              onChange={(e) => setForm({ ...form, cofinsRate: Number(e.target.value) })}
            />
          </label>
          <label>
            IBS % (reforma)
            <input
              type="number"
              value={form.ibsRate}
              onChange={(e) => setForm({ ...form, ibsRate: Number(e.target.value) })}
            />
          </label>
          <label>
            CBS % (reforma)
            <input
              type="number"
              value={form.cbsRate}
              onChange={(e) => setForm({ ...form, cbsRate: Number(e.target.value) })}
            />
          </label>
          <AdminPicker
            label="CFOP padrão"
            value={form.defaultCfopId}
            placeholder="Nenhum"
            options={cfops.map((item) => ({
              value: item.id,
              label: `${item.code} — ${item.description}`,
            }))}
            onChange={(value) => setForm({ ...form, defaultCfopId: value })}
          />
          <AdminPicker
            label="Situação"
            value={form.active ? '1' : '0'}
            options={[
              { value: '1', label: 'Ativa' },
              { value: '0', label: 'Inativa' },
            ]}
            onChange={(value) => setForm({ ...form, active: value === '1' })}
          />
          <label className="span-2">
            Observações
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            {editingId ? 'Salvar' : 'Cadastrar'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setEditingId(undefined);
                setForm({ ...EMPTY, defaultCfopId: cfops[0]?.id ?? '' });
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </article>

      <article className="admin-card">
        <h2>Classificações</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>NCM</th>
              <th>CST</th>
              <th>ICMS</th>
              <th>IBS/CBS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.ncm}</td>
                <td>{item.cstIcms}</td>
                <td>{item.icmsRate}%</td>
                <td>
                  {item.ibsRate}% / {item.cbsRate}%
                </td>
                <td className="admin-table__actions">
                  <div className="crud-actions">
                    <CrudIconButton action="edit" onClick={() => edit(item.id)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
