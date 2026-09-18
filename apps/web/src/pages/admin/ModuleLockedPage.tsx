import { Link } from 'react-router-dom';
import { PARTNER_MODULES, type PartnerModuleId } from '../../data/catalog';
import { getStoreEntitlement, planLabel } from '../../data/storePlan';

export function ModuleLockedPage({ moduleId }: { moduleId: PartnerModuleId }) {
  const module = PARTNER_MODULES.find((item) => item.id === moduleId);
  const entitlement = getStoreEntitlement();

  return (
    <section className="admin-page">
      <article className="admin-card admin-card--form">
        <h2>Módulo não liberado</h2>
        <p>
          <strong>{module?.name ?? 'Este módulo'}</strong> não entra no plano{' '}
          <strong>{planLabel(entitlement.planId)}</strong> desta loja.
        </p>
        <p>{module?.blurb}</p>
        <div className="admin-toolbar admin-toolbar--stack">
          <Link to="/painel/plano" className="btn btn--primary">
            Ver plano da loja
          </Link>
          <Link to="/painel" className="btn btn--ghost">
            Voltar ao painel
          </Link>
        </div>
      </article>
    </section>
  );
}
