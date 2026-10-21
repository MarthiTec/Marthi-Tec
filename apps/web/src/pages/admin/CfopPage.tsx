import { useEffect, useState } from 'react';
import {
  AdminPicker,
  CrudNameButton,
  CrudRowActions,
  HeadingFormActions,
  confirmDelete,
} from '../../design-system';
import {
  CFOP_OPERATION_LABEL,
  listCfops,
  listFecps,
  upsertCfop,
  upsertFecp,
  type CfopCode,
  type FecpRule,
} from '../../data/fiscalCatalog';

type Panel = 'cfop' | 'fecp' | null;

export function CfopPage() {
  const [cfops, setCfops] = useState(() => listCfops());
  const [fecps, setFecps] = useState(() => listFecps());
  const [panel, setPanel] = useState<Panel>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [readOnly, setReadOnly] = useState(false);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [operation, setOperation] = useState<CfopCode['operation']>('out_same');
  const [uf, setUf] = useState('RJ');
  const [fecpDesc, setFecpDesc] = useState('');
  const [rate, setRate] = useState('2');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function clearForm() {
    setPanel(null);
    setEditingId(undefined);
    setReadOnly(false);
    setCode('');
    setDescription('');
    setOperation('out_same');
    setUf('RJ');
    setFecpDesc('');
    setRate('2');
    setError('');
  }

  function openCfop(item?: CfopCode, view = false, duplicate = false) {
    setError('');
    setPanel('cfop');
    setReadOnly(view);
    if (!item) {
      setEditingId(undefined);
      setCode('');
      setDescription('');
      setOperation('out_same');
      return;
    }
    setEditingId(duplicate ? undefined : item.id);
    setCode(duplicate ? '' : item.code);
    setDescription(duplicate ? `${item.description} (cópia)` : item.description);
    setOperation(item.operation);
  }

  function openFecp(item?: FecpRule, view = false, duplicate = false) {
    setError('');
    setPanel('fecp');
    setReadOnly(view);
    if (!item) {
      setEditingId(undefined);
      setUf('RJ');
      setFecpDesc('');
      setRate('2');
      return;
    }
    setEditingId(duplicate ? undefined : item.id);
    setUf(item.uf);
    setFecpDesc(duplicate ? `${item.description} (cópia)` : item.description);
    setRate(String(item.rate));
  }

  async function save() {
    if (saving || readOnly || !panel) return;
    setSaving(true);
    setError('');
    try {
      if (panel === 'cfop') {
        const result = await upsertCfop({
          id: editingId,
          code,
          description,
          operation,
          active: true,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setCfops(listCfops());
      } else {
        const result = await upsertFecp({
          id: editingId,
          uf,
          description: fecpDesc,
          rate: Number(rate.replace(',', '.')) || 0,
          active: true,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFecps(listFecps());
      }
      clearForm();
    } finally {
      setSaving(false);
    }
  }

  async function removeCfop(item: CfopCode) {
    if (!confirmDelete(item.code)) return;
    const result = await upsertCfop({ ...item, active: false });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCfops(listCfops());
    if (editingId === item.id) clearForm();
  }

  async function removeFecp(item: FecpRule) {
    if (!confirmDelete(`${item.uf} — ${item.description || 'FECP'}`)) return;
    const result = await upsertFecp({ ...item, active: false });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFecps(listFecps());
    if (editingId === item.id) clearForm();
  }

  const formMode = !panel ? 'list' : readOnly ? 'view' : 'edit';

  useEffect(() => {
    if (!panel || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="admin-page">
      {panel === 'cfop' ? (
        <HeadingFormActions
          mode={formMode}
          onNew={() => openCfop()}
          onClose={clearForm}
          onEdit={() => setReadOnly(false)}
          onSave={() => void save()}
          saving={saving}
          newLabel="Novo CFOP"
          saveLabel={saving ? 'Salvando…' : editingId ? 'Salvar CFOP' : 'Cadastrar CFOP'}
          items={cfops}
          currentId={editingId}
          onOpen={(row) => openCfop(row, true)}
        />
      ) : panel === 'fecp' ? (
        <HeadingFormActions
          mode={formMode}
          onNew={() => openFecp()}
          onClose={clearForm}
          onEdit={() => setReadOnly(false)}
          onSave={() => void save()}
          saving={saving}
          newLabel="Novo FECP"
          saveLabel={saving ? 'Salvando…' : editingId ? 'Salvar FECP' : 'Cadastrar FECP'}
          items={fecps}
          currentId={editingId}
          onOpen={(row) => openFecp(row, true)}
        />
      ) : (
        <HeadingFormActions
          mode="list"
          onNew={() => openCfop()}
          onClose={clearForm}
          newLabel="Novo CFOP"
        />
      )}
      {error ? <p className="qty-low">{error}</p> : null}

      {panel === 'cfop' ? (
        <article className="admin-card">
          <h2>{readOnly ? 'Consultar CFOP' : editingId ? 'Editar CFOP' : 'Novo CFOP'}</h2>
          <p>Tabela de códigos fiscais de operações — vinculável na classificação e na NF-e.</p>
          <div className="admin-form">
            <label>
              Código
              <input
                value={code}
                disabled={readOnly || saving}
                onChange={(e) => setCode(e.target.value)}
                placeholder="5102"
              />
            </label>
            <AdminPicker
              label="Tipo de operação"
              value={operation}
              disabled={readOnly || saving}
              options={(Object.keys(CFOP_OPERATION_LABEL) as CfopCode['operation'][]).map((key) => ({
                value: key,
                label: CFOP_OPERATION_LABEL[key],
              }))}
              onChange={(value) => setOperation(value as CfopCode['operation'])}
            />
            <label className="span-2">
              Descrição
              <input
                value={description}
                disabled={readOnly || saving}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>
        </article>
      ) : null}

      {panel === 'fecp' ? (
        <article className="admin-card">
          <h2>{readOnly ? 'Consultar FECP' : editingId ? 'Editar FECP' : 'Novo FECP'}</h2>
          <p>Fundo estadual de combate à pobreza — alíquota adicional por UF.</p>
          <div className="admin-form">
            <label>
              UF
              <input
                value={uf}
                disabled={readOnly || saving}
                onChange={(e) => setUf(e.target.value)}
                maxLength={2}
              />
            </label>
            <label>
              Alíquota %
              <input value={rate} disabled={readOnly || saving} onChange={(e) => setRate(e.target.value)} />
            </label>
            <label className="span-2">
              Descrição
              <input
                value={fecpDesc}
                disabled={readOnly || saving}
                onChange={(e) => setFecpDesc(e.target.value)}
              />
            </label>
          </div>
        </article>
      ) : null}

      {!panel ? (
        <>
          <article className="admin-card">
            <div className="admin-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ margin: 0, flex: '1 1 auto' }}>CFOP</h2>
              <button type="button" className="btn btn--primary" onClick={() => openCfop()}>
                + Novo CFOP
              </button>
            </div>
            <p>Tabela de códigos fiscais de operações — vinculável na classificação e na NF-e.</p>
            <div className="admin-table-container" style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th>Operação</th>
                    <th>Status</th>
                    <th className="admin-table__actions" style={{ textAlign: 'center', width: 130 }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cfops.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <CrudNameButton onClick={() => openCfop(item, true)}>
                          <strong>{item.code}</strong>
                        </CrudNameButton>
                      </td>
                      <td>{item.description}</td>
                      <td>{CFOP_OPERATION_LABEL[item.operation]}</td>
                      <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => openCfop(item, true)}
                          onEdit={() => openCfop(item)}
                          onDuplicate={() => openCfop(item, false, true)}
                          onDelete={() => void removeCfop(item)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="admin-card">
            <div className="admin-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ margin: 0, flex: '1 1 auto' }}>FECP</h2>
              <button type="button" className="btn btn--primary" onClick={() => openFecp()}>
                + Novo FECP
              </button>
            </div>
            <p>Fundo estadual de combate à pobreza — alíquota adicional por UF.</p>
            <div className="admin-table-container" style={{ marginTop: 16 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>UF</th>
                    <th>Descrição</th>
                    <th>Alíquota</th>
                    <th>Status</th>
                    <th className="admin-table__actions" style={{ textAlign: 'center', width: 130 }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fecps.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <CrudNameButton onClick={() => openFecp(item, true)}>
                          <strong>{item.uf}</strong>
                        </CrudNameButton>
                      </td>
                      <td>{item.description}</td>
                      <td>{item.rate}%</td>
                      <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => openFecp(item, true)}
                          onEdit={() => openFecp(item)}
                          onDuplicate={() => openFecp(item, false, true)}
                          onDelete={() => void removeFecp(item)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}
