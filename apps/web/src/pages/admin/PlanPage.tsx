import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  PARTNER_MODULES,
  PLANS,
  getPlanModuleLimit,
  planIncludesAllModules,
  type PartnerModuleId,
  type PlanId,
} from '../../data/catalog';
import { userIsStoreAdmin } from '../../data/erpRegistry';
import {
  clampModulesForPlan,
  getStoreEntitlement,
  saveStoreEntitlement,
} from '../../data/storePlan';

export function PlanPage() {
  const { user } = useAuth();
  const current = getStoreEntitlement();
  const [planId, setPlanId] = useState<PlanId>(current.planId);
  const [modules, setModules] = useState<PartnerModuleId[]>(current.modules);
  const [saved, setSaved] = useState(false);
  const isAdmin = userIsStoreAdmin(user?.email);

  const lockedAll = planIncludesAllModules(planId);
  const limit = getPlanModuleLimit(planId);
  const selected = useMemo(
    () => (lockedAll ? PARTNER_MODULES.map((item) => item.id) : modules),
    [lockedAll, modules],
  );
  const plan = PLANS.find((item) => item.id === planId) ?? PLANS[0];

  if (!isAdmin) {
    return <Navigate to="/painel" replace />;
  }

  function selectPlan(next: PlanId) {
    setPlanId(next);
    if (planIncludesAllModules(next)) {
      setModules(PARTNER_MODULES.map((item) => item.id));
    } else {
      setModules(clampModulesForPlan(next, modules.length ? modules : ['totem']));
    }
    setSaved(false);
  }

  function toggle(id: PartnerModuleId) {
    if (lockedAll) return;
    setModules((currentModules) => {
      if (currentModules.includes(id)) {
        return currentModules.filter((item) => item !== id);
      }
      if (currentModules.length >= getPlanModuleLimit(planId)) return currentModules;
      return [...currentModules, id];
    });
    setSaved(false);
  }

  function save() {
    const next = saveStoreEntitlement({ planId, modules: selected });
    setPlanId(next.planId);
    setModules(next.modules);
    setSaved(true);
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Plano da loja</h2>
        <p>
          Bronze (1 módulo), Silver (2 módulos) e Golden (tudo). Visível apenas para
          administradores.
        </p>
        <div className="plan-picker">
          {PLANS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`plan-picker__card plan-picker__card--${item.id} ${planId === item.id ? 'is-active' : ''}`}
              onClick={() => selectPlan(item.id)}
            >
              <strong>{item.name}</strong>
              <span>
                {item.price}
                {item.period}
              </span>
              <span>{item.blurb}</span>
            </button>
          ))}
        </div>
        <ul className="plan-benefits">
          {plan.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </article>

      <article className="admin-card">
        <h2>Módulos liberados</h2>
        <p>
          {lockedAll
            ? 'Golden libera Totem, OS, ERP e Emissor Fiscal juntos.'
            : `${selected.length} de ${limit} módulo(s) no plano ${plan.name}.`}
        </p>
        <div className="module-picker">
          {PARTNER_MODULES.map((module) => {
            const checked = selected.includes(module.id);
            const blocked = !lockedAll && !checked && selected.length >= limit;
            return (
              <label
                key={module.id}
                className={`module-picker__item ${checked ? 'is-active' : ''} ${blocked ? 'is-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={lockedAll || blocked}
                  onChange={() => toggle(module.id)}
                />
                <span>
                  <strong>{module.name}</strong>
                  <em>{module.blurb}</em>
                </span>
              </label>
            );
          })}
        </div>
        <div className="admin-toolbar admin-toolbar--stack">
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={!lockedAll && selected.length === 0}
          >
            Salvar liberação
          </button>
          {saved ? (
            <span className="empty">Plano atualizado. O menu lateral já respeita a liberação.</span>
          ) : null}
        </div>
      </article>
    </section>
  );
}
