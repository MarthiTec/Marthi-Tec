import { useEffect, useState } from 'react';
import { AdminIcon } from '../../components/AdminIcons';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { listAuditEntries, type AuditEntry } from '../../data/auditLog';
import {
  getCommercialPlans,
  updateCommercialPlan,
  resetCommercialPlansToDefault,
  PLANS_UPDATED_EVENT,
  type CommercialPlan,
} from '../../data/plansStore';

export function MarthiPlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<CommercialPlan[]>(() => getCommercialPlans(true));
  const [editingPlan, setEditingPlan] = useState<CommercialPlan | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Form edit states
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPromoPrice, setEditPromoPrice] = useState('');
  const [editPeriod, setEditPeriod] = useState('/mês');
  const [editBlurb, setEditBlurb] = useState('');
  const [editCallout, setEditCallout] = useState('');
  const [editHomeSummary, setEditHomeSummary] = useState('');
  const [editFullDescription, setEditFullDescription] = useState('');
  const [editFeatured, setEditFeatured] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [editDisplayOrder, setEditDisplayOrder] = useState(1);
  const [editFeatures, setEditFeatures] = useState<string[]>([]);
  const [newFeatureText, setNewFeatureText] = useState('');

  function refresh() {
    setPlans(getCommercialPlans(true));
    const allLogs = listAuditEntries();
    setAuditLogs(allLogs.filter((l) => l.path.includes('/admin/planos') || l.action.toLowerCase().includes('plano')));
  }

  useEffect(() => {
    refresh();
    const handleUpdate = () => refresh();
    window.addEventListener(PLANS_UPDATED_EVENT, handleUpdate);
    window.addEventListener('marthi-audit-updated', handleUpdate);
    return () => {
      window.removeEventListener(PLANS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('marthi-audit-updated', handleUpdate);
    };
  }, []);

  function handleOpenEdit(plan: CommercialPlan) {
    setEditingPlan(plan);
    setEditName(plan.name);
    setEditPrice(plan.price);
    setEditPromoPrice(plan.promotionalPrice || '');
    setEditPeriod(plan.period || '/mês');
    setEditBlurb(plan.blurb || '');
    setEditCallout(plan.commercialCallout || '');
    setEditHomeSummary(plan.homeSummary || '');
    setEditFullDescription(plan.fullDescription || '');
    setEditFeatured(plan.featured || false);
    setEditActive(plan.active !== false);
    setEditDisplayOrder(plan.displayOrder || 1);
    setEditFeatures([...plan.features]);
    setNewFeatureText('');
  }

  function handleAddFeature() {
    if (!newFeatureText.trim()) return;
    setEditFeatures((prev) => [...prev, newFeatureText.trim()]);
    setNewFeatureText('');
  }

  function handleRemoveFeature(index: number) {
    setEditFeatures((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPlan) return;

    try {
      updateCommercialPlan(
        editingPlan.id,
        {
          name: editName.trim() || editingPlan.name,
          price: editPrice.trim(),
          promotionalPrice: editPromoPrice.trim() || undefined,
          period: editPeriod.trim(),
          blurb: editBlurb.trim(),
          commercialCallout: editCallout.trim(),
          homeSummary: editHomeSummary.trim(),
          fullDescription: editFullDescription.trim(),
          featured: editFeatured,
          active: editActive,
          displayOrder: Number(editDisplayOrder) || 1,
          features: editFeatures.filter((f) => Boolean(f.trim())),
        },
        {
          name: user?.name || 'Administrador Marthi',
          email: user?.email || 'admin@marthi.com.br',
        },
      );

      setFeedback(`Plano "${editName}" atualizado com sucesso! As alterações já estão ativas na Home e na página de Planos.`);
      setTimeout(() => setFeedback(null), 4000);
      setEditingPlan(null);
      refresh();
    } catch (err: unknown) {
      alert((err as Error).message || 'Erro ao atualizar plano.');
    }
  }

  function handleConfirmReset() {
    resetCommercialPlansToDefault({
      name: user?.name || 'Administrador Marthi',
      email: user?.email || 'admin@marthi.com.br',
    });
    setResetDialogOpen(false);
    setFeedback('Planos comerciais restaurados com sucesso para os valores de fábrica.');
    setTimeout(() => setFeedback(null), 4000);
    refresh();
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <span className="admin-page__kicker">Comercial & Vendas</span>
          <h1 className="admin-page__title">Gerenciamento dos Planos Comerciais</h1>
          <p className="admin-page__lead">
            Edite preços, chamadas promocionais, benefícios e destaques em tempo real. As alterações refletem imediatamente na Home, na página de Planos e no fluxo de assinatura.
          </p>
        </div>
        <div className="admin-page__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setResetDialogOpen(true)}
            title="Restaurar planos para os valores padrão de fábrica"
          >
            <AdminIcon name="restore" />
            <span>Restaurar Padrões</span>
          </button>
        </div>
      </header>

      {feedback ? (
        <div className="marthi-feedback-banner">
          <span>✓ {feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}>✕</button>
        </div>
      ) : null}

      {/* Grid de Planos Comerciais */}
      <div className="marthi-plans-grid">
        {plans.map((p) => (
          <article
            key={p.id}
            className={`marthi-plan-card ${p.featured ? 'is-featured' : ''} ${!p.active ? 'is-inactive' : ''}`}
          >
            <header className="marthi-plan-card__header">
              <div className="marthi-plan-card__badges">
                <span className="marthi-plan-card__id">{p.id.toUpperCase()}</span>
                {p.featured ? <span className="marthi-plan-badge marthi-plan-badge--featured">Destaque na Home</span> : null}
                {!p.active ? <span className="marthi-plan-badge marthi-plan-badge--inactive">Inativo</span> : null}
              </div>
              <h2 className="marthi-plan-card__title">{p.name}</h2>
              <p className="marthi-plan-card__callout">{p.commercialCallout || p.blurb}</p>
            </header>

            <div className="marthi-plan-card__pricing">
              <div className="marthi-plan-card__price-main">
                <span className="marthi-plan-card__amount">{p.price}</span>
                <span className="marthi-plan-card__period">{p.period}</span>
              </div>
              {p.promotionalPrice ? (
                <div className="marthi-plan-card__promo">
                  <span>De {p.price} por apenas <strong>{p.promotionalPrice}</strong></span>
                </div>
              ) : null}
            </div>

            <div className="marthi-plan-card__content">
              <p className="marthi-plan-card__blurb">{p.blurb}</p>
              <div className="marthi-plan-card__meta">
                <span>Ordem de exibição: <strong>#{p.displayOrder}</strong></span>
                <span>Módulos inclusos: <strong>{p.allModules ? 'Todos (Total)' : `Até ${p.maxModules}`}</strong></span>
              </div>

              <div className="marthi-plan-card__features-preview">
                <strong>{p.features.length} Benefícios configurados:</strong>
                <ul>
                  {p.features.slice(0, 3).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                  {p.features.length > 3 ? (
                    <li className="marthi-plan-card__features-more">+{p.features.length - 3} outros benefícios...</li>
                  ) : null}
                </ul>
              </div>
            </div>

            <footer className="marthi-plan-card__foot">
              <button
                type="button"
                className="btn btn--primary btn--full"
                onClick={() => handleOpenEdit(p)}
              >
                <AdminIcon name="edit" />
                <span>Editar Informações do Plano</span>
              </button>
            </footer>
          </article>
        ))}
      </div>

      {/* Histórico de Alterações dos Planos (Auditoria) */}
      <section className="marthi-audit-section">
        <div className="marthi-audit-section__head">
          <div>
            <h3>Histórico de Alterações Comerciais (Auditoria)</h3>
            <p>Registro de quem alterou preços, chamadas ou benefícios e quando a alteração foi realizada.</p>
          </div>
          <span className="marthi-audit-badge">{auditLogs.length} registros</span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="marthi-audit-empty">
            <p>Nenhuma alteração registrada ainda. Todas as modificações em planos ficarão arquivadas aqui com data, autor e valores anteriores.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Responsável</th>
                  <th>Ação</th>
                  <th>Detalhes da Mudança</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.slice(0, 15).map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.at).toLocaleString('pt-BR')}
                    </td>
                    <td>
                      <strong>{log.actorName}</strong>
                      <br />
                      <small style={{ color: '#64748b' }}>{log.actorEmail}</small>
                    </td>
                    <td>
                      <span className="marthi-action-chip">{log.action}</span>
                    </td>
                    <td style={{ fontSize: '0.86rem', color: '#334155' }}>
                      {log.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal / Drawer de Edição do Plano */}
      {editingPlan ? (
        <div className="marthi-modal-backdrop" onClick={() => setEditingPlan(null)}>
          <div
            className="marthi-modal-card marthi-modal-card--lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Editar Plano Comercial</span>
                <h2>{editingPlan.name} ({editingPlan.id.toUpperCase()})</h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setEditingPlan(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleSavePlan} className="marthi-modal-form">
              <div className="marthi-form-grid">
                <label className="marthi-form-field">
                  <span>Nome Comercial do Plano *</span>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: Silver"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Preço Exibido *</span>
                  <input
                    type="text"
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    placeholder="Ex: R$ 119,90"
                  />
                  <small>Exemplo: R$ 99,90, R$ 119,00 ou R$ 497</small>
                </label>

                <label className="marthi-form-field">
                  <span>Preço Promocional (Opcional)</span>
                  <input
                    type="text"
                    value={editPromoPrice}
                    onChange={(e) => setEditPromoPrice(e.target.value)}
                    placeholder="Ex: R$ 89,90"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Período de Cobrança</span>
                  <input
                    type="text"
                    value={editPeriod}
                    onChange={(e) => setEditPeriod(e.target.value)}
                    placeholder="Ex: /mês ou /ano"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Ordem de Exibição</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={editDisplayOrder}
                    onChange={(e) => setEditDisplayOrder(Number(e.target.value))}
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Chamada Comercial (Slogan / Badge)</span>
                  <input
                    type="text"
                    value={editCallout}
                    onChange={(e) => setEditCallout(e.target.value)}
                    placeholder="Ex: Ideal para pequenas empresas"
                  />
                </label>
              </div>

              <div className="marthi-form-switches">
                <label className="marthi-switch-label">
                  <input
                    type="checkbox"
                    checked={editFeatured}
                    onChange={(e) => setEditFeatured(e.target.checked)}
                  />
                  <span>Destaque Comercial (Exibir selo "Mais Escolhido" na Home e nos Planos)</span>
                </label>

                <label className="marthi-switch-label">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                  />
                  <span>Plano Ativo (Disponível para contratação e visualização pública)</span>
                </label>
              </div>

              <label className="marthi-form-field">
                <span>Descrição Curta (Exibida nos cards) *</span>
                <textarea
                  rows={2}
                  required
                  value={editBlurb}
                  onChange={(e) => setEditBlurb(e.target.value)}
                  placeholder="Resumo em 1 ou 2 frases sobre para quem é este plano..."
                />
              </label>

              <label className="marthi-form-field">
                <span>Resumo para a Home Page</span>
                <input
                  type="text"
                  value={editHomeSummary}
                  onChange={(e) => setEditHomeSummary(e.target.value)}
                  placeholder="Texto explicativo breve que aparece na seção de planos da Home"
                />
              </label>

              <label className="marthi-form-field">
                <span>Descrição Completa</span>
                <textarea
                  rows={3}
                  value={editFullDescription}
                  onChange={(e) => setEditFullDescription(e.target.value)}
                  placeholder="Detalhamento institucional do plano para a equipe comercial..."
                />
              </label>

              {/* Gerenciamento de Benefícios */}
              <div className="marthi-features-editor">
                <h4>Benefícios e Funcionalidades Inclusas ({editFeatures.length})</h4>
                <div className="marthi-features-add">
                  <input
                    type="text"
                    value={newFeatureText}
                    onChange={(e) => setNewFeatureText(e.target.value)}
                    placeholder="Novo benefício (ex: Suporte prioritário via WhatsApp)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddFeature();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={handleAddFeature}
                  >
                    + Adicionar
                  </button>
                </div>

                <ul className="marthi-features-list">
                  {editFeatures.map((feat, idx) => (
                    <li key={idx}>
                      <span>{feat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(idx)}
                        className="marthi-features-del"
                        title="Remover benefício"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <footer className="marthi-modal-foot">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setEditingPlan(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary">
                  Salvar Alterações
                </button>
              </footer>
            </form>
          </div>
        </div>
      ) : null}

      {/* Confirmação de Restauração */}
      <ConfirmDialog
        open={resetDialogOpen}
        title="Restaurar Planos Padrão?"
        message="Tem certeza que deseja restaurar os planos comerciais para os valores originais de fábrica? Quaisquer edições personalizadas de preços e textos serão substituídas."
        confirmLabel="Sim, Restaurar"
        cancelLabel="Voltar"
        danger={true}
        onConfirm={handleConfirmReset}
        onCancel={() => setResetDialogOpen(false)}
      />
    </div>
  );
}
