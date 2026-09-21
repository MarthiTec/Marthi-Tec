import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { FISCAL_KIND_LABEL, FISCAL_STATUS_LABEL, listFiscalDocuments } from '../../data/fiscalDocuments';
import { getFiscalIssuerSettings } from '../../data/fiscalIssuerStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Demonstrativo fiscal no painel — emissão fica em /fiscal. */
export function FiscalPanelPage() {
  const docs = useMemo(() => listFiscalDocuments(), []);
  const settings = useMemo(() => getFiscalIssuerSettings(), []);
  const recent = useMemo(
    () => [...docs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [docs],
  );
  const authorized = docs.filter((item) => item.status === 'authorized').length;
  const pending = docs.filter((item) => item.status === 'pending').length;
  const total = docs.reduce((sum, item) => sum + (item.amount || 0), 0);

  return (
    <section className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: 12 }}>
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Visão administrativa do emissor. Emitir NF-e/NFS-e/CT-e/MDF-e é no app fiscal.
          </p>
        </div>
        <Link to="/fiscal" className="btn btn--primary">
          <AdminIcon name="fiscal" />
          Abrir emissor
        </Link>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Autorizadas</h2>
          <strong>{authorized}</strong>
          <p>Documentos com sucesso.</p>
        </article>
        <article className="admin-card">
          <h2>Pendentes</h2>
          <strong>{pending}</strong>
          <p>Aguardando retorno.</p>
        </article>
        <article className="admin-card">
          <h2>Volume</h2>
          <strong>{money(total)}</strong>
          <p>Soma dos documentos.</p>
        </article>
        <article className="admin-card">
          <h2>Ambiente</h2>
          <strong>{settings.environment === 'producao' ? 'Produção' : 'Homologação'}</strong>
          <p>{settings.emitenteName || 'Emitente não configurado'}</p>
        </article>
      </div>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <div className="admin-toolbar">
          <h2 style={{ margin: 0 }}>Últimas notas</h2>
          <div className="admin-toolbar">
            <Link to="/painel/notas" className="btn btn--ghost">
              Ver todas
            </Link>
            <Link to="/fiscal" className="btn btn--ghost">
              Emitir no app
            </Link>
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="empty">Nenhuma nota ainda. Abra o emissor para lançar.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      {doc.number}/{doc.series}
                    </td>
                    <td>{FISCAL_KIND_LABEL[doc.kind]}</td>
                    <td>{FISCAL_STATUS_LABEL[doc.status]}</td>
                    <td>{money(doc.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <div className="admin-toolbar" style={{ marginTop: 12 }}>
        <Link to="/painel/classificacao-fiscal" className="btn btn--ghost">
          Classificação fiscal
        </Link>
        <Link to="/painel/cfop" className="btn btn--ghost">
          CFOP e FECP
        </Link>
        <Link to="/painel/fiscal/config" className="btn btn--ghost">
          Configuração
        </Link>
      </div>
    </section>
  );
}
