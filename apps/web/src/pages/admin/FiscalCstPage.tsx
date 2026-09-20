import { useMemo, useState } from 'react';
import {
  CCLASSTRIB_API_URL,
  CCLASSTRIB_PORTAL_URL,
  getTaxTablesMeta,
  listFiscalCClassTribs,
  listFiscalCsts,
  resetTaxTablesToSeed,
  syncTaxTablesFromGovApi,
  upsertFiscalCClassTrib,
  upsertFiscalCst,
  type FiscalCstCode,
} from '../../data/fiscalTaxTables';

export function FiscalCstPage() {
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [cstCode, setCstCode] = useState('');
  const [cstName, setCstName] = useState('');
  const [cClassCode, setCClassCode] = useState('');
  const [cClassName, setCClassName] = useState('');

  const meta = useMemo(() => getTaxTablesMeta(), [tick, message]);
  const csts = useMemo(() => listFiscalCsts(), [tick]);
  const allClasses = useMemo(() => listFiscalCClassTribs(false), [tick]);

  const classCountByCst = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allClasses) {
      map.set(item.cstCode, (map.get(item.cstCode) ?? 0) + 1);
    }
    return map;
  }, [allClasses]);

  const filteredCsts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return csts;
    return csts.filter((item) =>
      `${item.code} ${item.name} ${item.description}`.toLowerCase().includes(needle),
    );
  }, [csts, query]);

  const selected: FiscalCstCode | null =
    csts.find((item) => item.code === selectedCode) ?? filteredCsts[0] ?? null;

  const classes = useMemo(() => {
    if (!selected) return [];
    return allClasses.filter((item) => item.cstCode === selected.code);
  }, [allClasses, selected?.code]);

  async function sync() {
    setBusy(true);
    setError('');
    setMessage('');
    const result = await syncTaxTablesFromGovApi();
    setBusy(false);
    setTick((value) => value + 1);
    if (!result.ok) {
      setError(result.error);
      setMessage(meta.lastSyncMessage);
      return;
    }
    setMessage(result.message);
  }

  function saveCst() {
    const result = upsertFiscalCst({ code: cstCode, name: cstName, description: '' });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const code = result.item.code;
    setCstCode('');
    setCstName('');
    setError('');
    setMessage(`CST ${code} salvo.`);
    setSelectedCode(code);
    setTick((value) => value + 1);
  }

  function saveCClass() {
    if (!selected) {
      setError('Selecione um CST à esquerda.');
      return;
    }
    const result = upsertFiscalCClassTrib({
      code: cClassCode,
      name: cClassName,
      cstCode: selected.code,
      description: '',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCClassCode('');
    setCClassName('');
    setError('');
    setMessage(`cClassTrib ${result.item.code} vinculado ao CST ${selected.code}.`);
    setTick((value) => value + 1);
  }

  return (
    <section className="admin-page fiscal-config">
      <article className="admin-card">
        <p className="fiscal-config__lead" style={{ marginBottom: 0 }}>
          Selecione um CST à esquerda para ver os cClassTrib vinculados. Sync oficial: API SVRS
          Conformidade Fácil (mTLS no Nest).
        </p>
        {message ? <p className="empty">{message}</p> : null}
        {error ? <p className="qty-low">{error}</p> : null}

        <div className="admin-toolbar" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={sync}>
            {busy ? 'Consultando API…' : 'Sincronizar API governo'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              resetTaxTablesToSeed();
              setSelectedCode(null);
              setTick((value) => value + 1);
              setMessage('Seed restaurado.');
              setError('');
            }}
          >
            Restaurar seed
          </button>
          <a className="btn btn--ghost" href={CCLASSTRIB_PORTAL_URL} target="_blank" rel="noreferrer">
            Portal SVRS
          </a>
        </div>
        <p className="empty" style={{ marginTop: 10 }}>
          {CCLASSTRIB_API_URL}
          {meta.lastSyncAt
            ? ` · Sync ${new Date(meta.lastSyncAt).toLocaleString('pt-BR')} (${meta.lastSyncSource})`
            : ' · Ainda não sincronizado'}
          {` · ${meta.cstCount} CST · ${meta.cClassCount} cClassTrib`}
        </p>
      </article>

      <div className="fiscal-md">
        <aside className="fiscal-md__master" aria-label="Lista de CST">
          <div className="fiscal-md__master-head">
            <strong>CST</strong>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar CST…"
              aria-label="Buscar CST"
            />
          </div>

          <ul className="fiscal-md__list">
            {filteredCsts.length === 0 ? (
              <li className="fiscal-md__empty">Nenhum CST encontrado.</li>
            ) : (
              filteredCsts.map((item) => {
                const active = selected?.code === item.code;
                const count = classCountByCst.get(item.code) ?? 0;
                return (
                  <li key={item.code}>
                    <button
                      type="button"
                      className={`fiscal-md__item ${active ? 'is-active' : ''}`}
                      onClick={() => setSelectedCode(item.code)}
                    >
                      <span className="fiscal-md__code">{item.code}</span>
                      <span className="fiscal-md__name">{item.name}</span>
                      <em>{count} class.</em>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="fiscal-md__add">
            <p>Novo CST</p>
            <label>
              Código
              <input
                value={cstCode}
                onChange={(e) => setCstCode(e.target.value)}
                placeholder="000"
              />
            </label>
            <label>
              Nome
              <input
                value={cstName}
                onChange={(e) => setCstName(e.target.value)}
                placeholder="Tributação integral"
              />
            </label>
            <button type="button" className="btn btn--ghost" onClick={saveCst}>
              Salvar CST
            </button>
          </div>
        </aside>

        <div className="fiscal-md__detail" aria-label="Detalhe do CST">
          {!selected ? (
            <article className="admin-card">
              <p className="empty">Selecione um CST na lista para ver os cClassTrib.</p>
            </article>
          ) : (
            <>
              <article className="admin-card fiscal-md__detail-card">
                <p className="fiscal-md__kicker">CST selecionado</p>
                <h2>
                  <span>{selected.code}</span> — {selected.name}
                </h2>
                <p className="fiscal-config__lead">
                  {selected.description?.trim() ||
                    'Situação tributária IBS/CBS. Os cClassTrib abaixo classificam a operação dentro deste CST.'}
                </p>
                <p className="empty" style={{ margin: 0 }}>
                  {classes.length} cClassTrib vinculado{classes.length === 1 ? '' : 's'}
                  {selected.active ? '' : ' · inativo'}
                </p>
              </article>

              <article className="admin-card">
                <h2>cClassTrib deste CST</h2>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nome</th>
                      <th>Descrição</th>
                      <th>LC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="empty">
                          Nenhum cClassTrib para o CST {selected.code}.
                        </td>
                      </tr>
                    ) : (
                      classes.map((item) => (
                        <tr key={item.code}>
                          <td>
                            <strong>{item.code}</strong>
                          </td>
                          <td>{item.name}</td>
                          <td>{item.description || '—'}</td>
                          <td>{item.linkLc || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </article>

              <article className="admin-card">
                <h2>Incluir cClassTrib em {selected.code}</h2>
                <div className="admin-form">
                  <label>
                    Código
                    <input
                      value={cClassCode}
                      onChange={(e) => setCClassCode(e.target.value)}
                      placeholder={`${selected.code}001`}
                    />
                  </label>
                  <label className="span-2">
                    Nome
                    <input
                      value={cClassName}
                      onChange={(e) => setCClassName(e.target.value)}
                      placeholder="Descrição da classificação"
                    />
                  </label>
                </div>
                <div className="admin-toolbar" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn--primary" onClick={saveCClass}>
                    Salvar cClassTrib
                  </button>
                </div>
              </article>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
