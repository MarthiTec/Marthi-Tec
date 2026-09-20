import { useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import {
  CFOP_OPERATION_LABEL,
  listCfops,
  listFecps,
  upsertCfop,
  upsertFecp,
  type CfopCode,
} from '../../data/fiscalCatalog';

export function CfopPage() {
  const [cfops, setCfops] = useState(() => listCfops());
  const [fecps, setFecps] = useState(() => listFecps());
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [operation, setOperation] = useState<CfopCode['operation']>('out_same');
  const [uf, setUf] = useState('RJ');
  const [fecpDesc, setFecpDesc] = useState('');
  const [rate, setRate] = useState('2');
  const [error, setError] = useState('');

  function saveCfop() {
    const result = upsertCfop({ code, description, operation, active: true });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCfops(listCfops());
    setCode('');
    setDescription('');
    setError('');
  }

  function saveFecp() {
    const result = upsertFecp({
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
    setFecpDesc('');
    setError('');
  }

  return (
    <section className="admin-page">
      {error ? <p className="qty-low">{error}</p> : null}
      <article className="admin-card">
        <h2>CFOP</h2>
        <p>Tabela de códigos fiscais de operações — vinculável na classificação e na NF-e.</p>
        <div className="admin-form">
          <label>
            Código
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="5102" />
          </label>
          <AdminPicker
            label="Tipo de operação"
            value={operation}
            options={(Object.keys(CFOP_OPERATION_LABEL) as CfopCode['operation'][]).map((key) => ({
              value: key,
              label: CFOP_OPERATION_LABEL[key],
            }))}
            onChange={(value) => setOperation(value as CfopCode['operation'])}
          />
          <label className="span-2">
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={saveCfop}>
            Cadastrar CFOP
          </button>
        </div>
        <table className="admin-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Operação</th>
            </tr>
          </thead>
          <tbody>
            {cfops.map((item) => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>{item.description}</td>
                <td>{CFOP_OPERATION_LABEL[item.operation]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article className="admin-card">
        <h2>FECP</h2>
        <p>Fundo estadual de combate à pobreza — alíquota adicional por UF.</p>
        <div className="admin-form">
          <label>
            UF
            <input value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} />
          </label>
          <label>
            Alíquota %
            <input value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="span-2">
            Descrição
            <input value={fecpDesc} onChange={(e) => setFecpDesc(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={saveFecp}>
            Cadastrar FECP
          </button>
        </div>
        <table className="admin-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>UF</th>
              <th>Descrição</th>
              <th>Alíquota</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fecps.map((item) => (
              <tr key={item.id}>
                <td>{item.uf}</td>
                <td>{item.description}</td>
                <td>{item.rate}%</td>
                <td>{item.active ? 'Ativo' : 'Inativo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
