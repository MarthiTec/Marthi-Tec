import { useMemo, useState } from 'react';
import {
  PARTNER_MODULES,
  PLANS,
  getPlanModuleLimit,
  planIncludesAllModules,
  type PartnerModuleId,
  type PlanId,
} from '../../data/catalog';
import {
  clampModulesForPlan,
  getStoreEntitlement,
  saveStoreEntitlement,
} from '../../data/storePlan';

export function PlanPage() {
  const current = getStoreEntitlement();
  const [planId, setPlanId] = useState<PlanId>(current.planId);
  const [modules, setModules] = useState<PartnerModuleId[]>(current.modules);
  const [saved, setSaved] = useState(false);

  const lockedAll = planIncludesAllModules(planId);
  const limit = getPlanModuleLimit(planId);
  const selected = useMemo(
    () => (lockedAll ? PARTNER_MODULES.map((item) => item.id) : modules),
    [lockedAll, modules],
  );

  function selectPlan(next: PlanId) {
    setPlanId(next);
    if (planIncludesAllModules(next)) {
      setModules(PARTNER_MODULES.map((item) => item.id));
    } else {
      const preferred = modules.filter((id) => id !== 'totem');
      const pool = preferred.length ? preferred : modules;
      setModules(clampModulesForPlan(next, pool));
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
          A liberação segue Start (1 módulo), Growth (até 2) e Scale (todos). Nesta demo você
          simula o contrato da Sua Loja.
        </p>
        <div className="plan-picker">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={`plan-picker__card ${planId === plan.id ? 'is-active' : ''}`}
              onClick={() => selectPlan(plan.id)}
            >
              <strong>{plan.name}</strong>
              <span>{plan.blurb}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="admin-card">
        <h2>Módulos liberados</h2>
        <p>
          {lockedAll
            ? 'Scale libera Totem, Pré-vendas, OS e ERP juntos.'
            : `${selected.length} de ${limit} módulo(s) no plano ${PLANS.find((item) => item.id === planId)?.name}.`}
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
          <button type="button" className="btn btn--primary" onClick={save} disabled={!lockedAll && selected.length === 0}>
            Salvar liberação
          </button>
          {saved ? <span className="empty">Plano atualizado. O menu lateral já respeita a liberação.</span> : null}
        </div>
      </article>
    </section>
  );
}
