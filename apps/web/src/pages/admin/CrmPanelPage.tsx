import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import {
  CRM_BOARD_STAGES,
  CRM_EVENT,
  CRM_SOURCE_LABEL,
  CRM_STAGE_LABEL,
  crmStageTotals,
  listCrmLeads,
  listCrmWonLeads,
} from '../../data/crmStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Demonstrativo do CRM dentro do painel — o app completo fica em /crm. */
export function CrmPanelPage() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, []);

  const leads = useMemo(() => listCrmLeads(), [tick]);
  const won = useMemo(() => listCrmWonLeads(), [tick]);
  const recent = useMemo(
    () => [...leads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
    [leads],
  );
  const openCount = leads.filter((item) => item.stage !== 'won' && item.stage !== 'lost').length;
  const poolCount = leads.filter((item) => !item.ownerSellerId && item.stage === 'leads').length;

  return (
    <section className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: 12 }}>
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Visão demonstrativa no painel. No CRM o cadastro é lead; cliente Marthi só após
            fechar e pagar.
          </p>
        </div>
        <Link to="/crm" className="btn btn--primary">
          <AdminIcon name="people" />
          Abrir CRM
        </Link>
      </div>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Negócios abertos</h2>
          <strong>{openCount}</strong>
          <p>No funil (exceto fechados/perdidos).</p>
        </article>
        <article className="admin-card">
          <h2>Pool</h2>
          <strong>{poolCount}</strong>
          <p>Leads sem responsável — disponíveis para puxar.</p>
        </article>
        <article className="admin-card">
          <h2>Fechados</h2>
          <strong>{won.length}</strong>
          <p>Negócios fechados (ainda lead até pagar).</p>
        </article>
        <article className="admin-card">
          <h2>Total no CRM</h2>
          <strong>{leads.length}</strong>
          <p>Leads e negócios registrados.</p>
        </article>
      </div>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <h2>Funil (resumo)</h2>
        <div className="admin-grid" style={{ marginTop: 8 }}>
          {CRM_BOARD_STAGES.map((stage) => {
            const totals = crmStageTotals(stage);
            return (
              <div key={stage}>
                <p className="empty" style={{ margin: 0 }}>
                  {CRM_STAGE_LABEL[stage]}
                </p>
                <strong>
                  {totals.count} · {money(totals.value)}
                </strong>
              </div>
            );
          })}
        </div>
      </article>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <div className="admin-toolbar">
          <h2 style={{ margin: 0 }}>Últimos negócios</h2>
          <Link to="/crm" className="btn btn--ghost">
            Abrir no CRM
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty">Nenhum lead ainda. Homepage, parceiro e Trabalhe conosco alimentam o CRM.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Etapa</th>
                  <th>Fonte</th>
                  <th>Responsável</th>
                  <th>Valor</th>
                  <th>Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((lead) => (
                  <tr key={lead.id}>
                    <td>{lead.name}</td>
                    <td>{CRM_STAGE_LABEL[lead.stage]}</td>
                    <td>{CRM_SOURCE_LABEL[lead.source]}</td>
                    <td>{lead.ownerName || 'Pool'}</td>
                    <td>{money(lead.value)}</td>
                    <td>{formatWhen(lead.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="admin-card" style={{ marginTop: 12 }}>
        <h2>Atalhos</h2>
        <div className="admin-toolbar">
          <Link to="/crm" className="btn btn--primary">
            Abrir app CRM
          </Link>
        </div>
      </article>
    </section>
  );
}
