import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import {
  deleteDiscountRule,
  listDiscountRules,
  resetDiscountRulesToDefault,
  saveDiscountRules,
  MULTI_STORE_CHANGED_EVENT,
  type LicensingDiscountRule,
} from '../../data/multiStoreStore';
import '../admin/admin.css';
import './marthi.css';

export function MarthiDiscountsPage() {
  const { user } = useAuth();
  const [rules, setRules] = useState<LicensingDiscountRule[]>(() => listDiscountRules());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<LicensingDiscountRule> | null>(null);
  const [viewingRule, setViewingRule] = useState<LicensingDiscountRule | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function refresh() {
    setRules(listDiscountRules());
  }

  useEffect(() => {
    window.addEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
  }, []);

  const stats = useMemo(() => {
    const total = rules.length;
    const active = rules.filter((r) => r.active).length;
    const maxPercent = rules
      .filter((r) => r.active && r.discountType === 'percent')
      .reduce((max, r) => Math.max(max, r.discountValue), 0);
    return { total, active, maxPercent };
  }, [rules]);

  function handleOpenCreate() {
    setEditingRule({
      name: '',
      minStores: 2,
      maxStores: null,
      discountType: 'percent',
      discountValue: 15,
      active: true,
      notes: '',
    });
    setModalOpen(true);
  }

  function handleOpenEdit(rule: LicensingDiscountRule) {
    setEditingRule({ ...rule });
    setViewingRule(null);
    setModalOpen(true);
  }

  function handleDuplicate(rule: LicensingDiscountRule) {
    const newRule: LicensingDiscountRule = {
      ...rule,
      id: `rule-${Date.now().toString(36)}`,
      name: `${rule.name} (Cópia)`,
      active: false,
    };
    const next = [...rules, newRule];
    saveDiscountRules(next);
    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: 'create',
      detail: `Regra de desconto duplicada a partir de "${rule.name}": ${newRule.name}`,
    });
    setFeedback(`Regra duplicada como "${newRule.name}". Edite para ativar.`);
  }

  function handleToggleRule(ruleId: string) {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    const nextStatus = !target.active;
    const next = rules.map((r) => (r.id === ruleId ? { ...r, active: nextStatus } : r));
    saveDiscountRules(next);
    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: 'update',
      detail: `Regra de desconto "${target.name}" alterada para ${nextStatus ? 'Ativa' : 'Inativa'}`,
    });
    setFeedback(`Regra "${target.name}" ${nextStatus ? 'ativada' : 'desativada'} com sucesso.`);
  }

  function handleDelete(rule: LicensingDiscountRule) {
    if (!confirmDelete(`a faixa "${rule.name}"`)) return;
    deleteDiscountRule(rule.id);
    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: 'delete',
      detail: `Regra de desconto excluída: ${rule.name}`,
    });
    setFeedback(`Regra "${rule.name}" removida com sucesso.`);
    if (viewingRule?.id === rule.id) setViewingRule(null);
  }

  function handleResetDefault() {
    if (window.confirm('Deseja restaurar as faixas de desconto progressivo padrão da Marthi Tecnologia?')) {
      resetDiscountRulesToDefault();
      logAction({
        actorName: user?.name ?? 'Admin Marthi',
        actorEmail: user?.email ?? 'admin@marthi.com.br',
        action: 'update',
        detail: 'Restauração das regras de desconto padrão da Marthi',
      });
      setFeedback('Regras restauradas para os padrões oficiais.');
    }
  }

  function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRule || !editingRule.name?.trim()) return;

    const list = [...rules];
    const isNew = !editingRule.id;
    if (editingRule.id) {
      const idx = list.findIndex((r) => r.id === editingRule.id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          name: editingRule.name.trim(),
          minStores: Number(editingRule.minStores) || 1,
          maxStores: editingRule.maxStores ? Number(editingRule.maxStores) : null,
          discountType: editingRule.discountType || 'percent',
          discountValue: Number(editingRule.discountValue) || 0,
          active: editingRule.active !== false,
          notes: editingRule.notes || '',
        };
      }
    } else {
      list.push({
        id: `rule-${Date.now().toString(36)}`,
        name: editingRule.name.trim(),
        minStores: Number(editingRule.minStores) || 1,
        maxStores: editingRule.maxStores ? Number(editingRule.maxStores) : null,
        discountType: editingRule.discountType || 'percent',
        discountValue: Number(editingRule.discountValue) || 0,
        active: editingRule.active !== false,
        notes: editingRule.notes || '',
      });
    }

    saveDiscountRules(list);
    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: isNew ? 'create' : 'update',
      detail: `Regra de desconto ${isNew ? 'criada' : 'atualizada'}: ${editingRule.name.trim()}`,
    });
    setModalOpen(false);
    setEditingRule(null);
    setFeedback(`Regra "${editingRule.name.trim()}" salva com sucesso.`);
  }

  return (
    <div className="marthi-page">
      <header className="marthi-page-head">
        <div>
          <span className="marthi-page-kicker">Administração Marthi · Licenciamento Multi-Loja</span>
          <h1>Regras de Desconto Progressivo</h1>
          <p className="marthi-page-sub">
            Controle de descontos progressivos e precificação por CNPJ. Os clientes visualizam no
            painel da loja apenas o valor líquido final que estão pagando e o detalhamento das empresas ativas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--ghost" onClick={handleResetDefault}>
            <AdminIcon name="restore" />
            Restaurar Padrão
          </button>
          <button type="button" className="btn btn--primary" onClick={handleOpenCreate}>
            <AdminIcon name="plus" />
            Nova Faixa de Desconto
          </button>
        </div>
      </header>

      <div className="marthi-tabs-nav">
        <Link
          to="/admin/planos"
          className="btn btn--ghost"
          style={{ borderRadius: '8px', padding: '6px 14px', fontSize: '0.86rem', textDecoration: 'none' }}
        >
          ← Planos Comerciais
        </Link>
        <button
          type="button"
          className="btn btn--primary"
          style={{ borderRadius: '8px', padding: '6px 14px', fontSize: '0.86rem' }}
        >
          Desconto Progressivo Multi-Loja ({rules.length})
        </button>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: '20px',
            borderRadius: '10px',
            background: 'rgba(22, 163, 74, 0.12)',
            border: '1px solid rgba(22, 163, 74, 0.35)',
            color: '#15803d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 600,
          }}
        >
          <span>✓ {feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="marthi-kpi-grid">
        <div className="marthi-kpi-card">
          <span className="marthi-kpi-card__label">Total de Faixas</span>
          <strong className="marthi-kpi-card__value">{stats.total}</strong>
          <span className="marthi-kpi-card__sub">Políticas cadastradas no sistema</span>
        </div>
        <div className="marthi-kpi-card">
          <span className="marthi-kpi-card__label">Faixas Ativas</span>
          <strong className="marthi-kpi-card__value" style={{ color: '#16a34a' }}>
            {stats.active}
          </strong>
          <span className="marthi-kpi-card__sub">Aplicadas no cálculo de filiais</span>
        </div>
        <div className="marthi-kpi-card">
          <span className="marthi-kpi-card__label">Desconto Máximo</span>
          <strong className="marthi-kpi-card__value" style={{ color: '#2563eb' }}>
            {stats.maxPercent}%
          </strong>
          <span className="marthi-kpi-card__sub">Para grandes redes corporativas</span>
        </div>
        <div className="marthi-kpi-card">
          <span className="marthi-kpi-card__label">Regra Base</span>
          <strong className="marthi-kpi-card__value" style={{ fontSize: '1.25rem' }}>
            A partir da 2ª Loja
          </strong>
          <span className="marthi-kpi-card__sub">Matriz sempre paga 100% integral</span>
        </div>
      </div>

      {/* Table section */}
      <section className="marthi-section">
        <div className="marthi-section__head">
          <div>
            <h2>Tabela de Políticas de Desconto</h2>
            <p>Os descontos cadastrados aqui são calculados dinamicamente no painel do lojista (aba Licenciamento por CNPJ).</p>
          </div>
        </div>

        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome da Regra Comercial</th>
                <th>Qtd. Mínima</th>
                <th>Qtd. Máxima</th>
                <th>Tipo de Desconto</th>
                <th>Valor / Percentual</th>
                <th>Status</th>
                <th>Observações Comerciais</th>
                <th className="admin-table__actions" style={{ textAlign: 'center', width: '180px' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <CrudNameButton onClick={() => setViewingRule(rule)}>
                      <strong>{rule.name}</strong>
                    </CrudNameButton>
                  </td>
                  <td>{rule.minStores} loja(s)</td>
                  <td>{rule.maxStores ? `${rule.maxStores} lojas` : 'Sem limite (N+)'}</td>
                  <td>{rule.discountType === 'percent' ? 'Percentual (%)' : 'Valor Fixo (R$)'}</td>
                  <td>
                    <strong style={{ color: '#2563eb', fontSize: '1.05rem' }}>
                      {rule.discountType === 'percent'
                        ? `${rule.discountValue}%`
                        : `R$ ${rule.discountValue.toFixed(2).replace('.', ',')}`}
                    </strong>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleToggleRule(rule.id)}
                      className={`marthi-pill ${rule.active ? 'marthi-pill--ok' : 'marthi-pill--offline'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '4px 10px' }}
                      title={`Clique para ${rule.active ? 'desativar' : 'ativar'}`}
                    >
                      {rule.active ? '● Ativa' : '○ Inativa'}
                    </button>
                  </td>
                  <td style={{ color: 'var(--mute, #64748b)', fontSize: '0.88rem' }}>
                    {rule.notes || '—'}
                  </td>
                  <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                    <CrudRowActions
                      onView={() => setViewingRule(rule)}
                      onEdit={() => handleOpenEdit(rule)}
                      onDuplicate={() => handleDuplicate(rule)}
                      onDelete={() => handleDelete(rule)}
                    />
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--mute)' }}>
                    Nenhuma regra de desconto cadastrada. Clique em "Nova Faixa de Desconto" ou "Restaurar Padrão".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Consulta / Detalhes (Visualizar) */}
      {viewingRule && (
        <div className="marthi-modal-backdrop" onClick={() => setViewingRule(null)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 540 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Consulta Comercial</span>
                <h2>{viewingRule.name}</h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setViewingRule(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <div className="marthi-modal-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="marthi-form-field">
                  <span>Faixa de Aplicação</span>
                  <strong>
                    {viewingRule.minStores} {viewingRule.maxStores ? `até ${viewingRule.maxStores} lojas` : 'lojas em diante (sem teto)'}
                  </strong>
                </div>
                <div className="marthi-form-field">
                  <span>Desconto Concedido</span>
                  <strong style={{ color: '#2563eb', fontSize: '1.2rem' }}>
                    {viewingRule.discountType === 'percent'
                      ? `${viewingRule.discountValue}% nas filiais`
                      : `R$ ${viewingRule.discountValue.toFixed(2).replace('.', ',')} por filial`}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="marthi-form-field">
                  <span>Status da Regra</span>
                  <div>
                    <span className={`marthi-pill ${viewingRule.active ? 'marthi-pill--ok' : 'marthi-pill--offline'}`}>
                      {viewingRule.active ? 'Ativa no cálculo' : 'Inativa (desconsiderada)'}
                    </span>
                  </div>
                </div>
                <div className="marthi-form-field">
                  <span>Tipo de Desconto</span>
                  <strong>{viewingRule.discountType === 'percent' ? 'Percentual (%)' : 'Valor Fixo (R$)'}</strong>
                </div>
              </div>

              <div className="marthi-form-field">
                <span>Observação Comercial</span>
                <p style={{ margin: 0, color: 'var(--mute, #64748b)', fontSize: '0.9rem' }}>
                  {viewingRule.notes || 'Nenhuma observação informada.'}
                </p>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(45, 212, 191, 0.08)',
                  border: '1px solid rgba(45, 212, 191, 0.25)',
                  fontSize: '0.86rem',
                }}
              >
                <strong>Exemplo de cálculo:</strong>
                <p style={{ margin: '4px 0 0' }}>
                  Para um lojista com <strong>{Math.max(viewingRule.minStores, 3)} lojas</strong> (1 matriz + {Math.max(viewingRule.minStores, 3) - 1} filiais),
                  a matriz paga 100% do plano e as {Math.max(viewingRule.minStores, 3) - 1} filiais recebem{' '}
                  <strong>{viewingRule.discountType === 'percent' ? `${viewingRule.discountValue}% de desconto cada` : `R$ ${viewingRule.discountValue} de desconto cada`}</strong>.
                </p>
              </div>

              <div className="marthi-modal-foot" style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setViewingRule(null)}>
                  Fechar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => handleOpenEdit(viewingRule)}
                >
                  Editar Faixa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edição / Criação */}
      {modalOpen && editingRule && (
        <div className="marthi-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 540 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Política Comercial</span>
                <h2>{editingRule.id ? 'Editar Faixa de Desconto' : 'Nova Faixa de Desconto'}</h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleSaveRule} className="marthi-modal-form">
              <label className="marthi-form-field">
                <span>Nome da Regra Comercial *</span>
                <input
                  type="text"
                  required
                  value={editingRule.name || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="Ex: 3 a 5 Lojas (25% off)"
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>Qtd. Mínima de Lojas *</span>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editingRule.minStores ?? 2}
                    onChange={(e) => setEditingRule({ ...editingRule, minStores: Number(e.target.value) })}
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Qtd. Máxima (vazio = ilimitado)</span>
                  <input
                    type="number"
                    min={1}
                    value={editingRule.maxStores ?? ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        maxStores: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Sem teto"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="marthi-form-field">
                  <AdminPicker
                    label="Tipo de Desconto"
                    value={editingRule.discountType || 'percent'}
                    options={[
                      { value: 'percent', label: 'Percentual (%)' },
                      { value: 'fixed', label: 'Valor Fixo (R$)' },
                    ]}
                    onChange={(val) =>
                      setEditingRule({ ...editingRule, discountType: val as 'percent' | 'fixed' })
                    }
                  />
                </div>

                <label className="marthi-form-field">
                  <span>Valor do Desconto *</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={editingRule.discountValue ?? 15}
                    onChange={(e) => setEditingRule({ ...editingRule, discountValue: Number(e.target.value) })}
                  />
                </label>
              </div>

              <label className="marthi-form-field">
                <span>Observação Comercial Interna</span>
                <input
                  type="text"
                  value={editingRule.notes || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, notes: e.target.value })}
                  placeholder="Ex: Aplicável a redes em expansão"
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={editingRule.active !== false}
                  onChange={(e) => setEditingRule({ ...editingRule, active: e.target.checked })}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Faixa Ativa (Disponível para cálculo)</span>
              </label>

              <div className="marthi-modal-foot" style={{ marginTop: '20px' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary">
                  Salvar Faixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
