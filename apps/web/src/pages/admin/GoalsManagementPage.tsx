import { useEffect, useState } from 'react';
import './goalsPages.css';
import { getActiveStore } from '../../data/multiStoreStore';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import {
  apiListSellers,
  apiCreateGoal,
  apiDeleteGoal,
  apiListGoals,
  apiUpdateGoal,
  type GoalRow,
} from '../../services/erpApi';

export function GoalsManagementPage() {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [readOnly,setReadOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [goalId, setGoalId] = useState('');
  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState<'revenue' | 'profit' | 'sales_count' | 'products_count'>('revenue');
  const [targetValue, setTargetValue] = useState<number>(0);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Array<{id: string; name: string}>>([]);
  const [active, setActive] = useState(true);

  // Níveis Progressivos
  const [progressiveTiers, setProgressiveTiers] = useState<Array<{ name: string; value: number }>>([]);

  // Comissão
  const [commPercent, setCommPercent] = useState<number>(0);
  const [fixedValue, setFixedValue] = useState(0);
  const [commType, setCommType] = useState<'percent_revenue' | 'percent_profit' | 'fixed_value'>('percent_revenue');
  const [requiresGoal, setRequiresGoal] = useState<boolean>(true);

  // Submissão
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadGoals() {
    setLoading(true);
    try {
      const res = await apiListGoals();
      setGoals(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao listar metas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGoals();
    apiListSellers().then(setSellers).catch(() => setError('Não foi possível carregar os vendedores.'));
  }, []);

  function handleOpenCreate() {
    setReadOnly(false);
    setIsEditing(false);
    setGoalId('');
    setName(new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    setGoalType('revenue');
    setTargetValue(0);
    const d = new Date();
    setStartDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
    setEndDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
    setSellerId('');
    setActive(true);
    setProgressiveTiers([]);
    setCommPercent(0);
    setFixedValue(0);
    setCommType('percent_revenue');
    setRequiresGoal(true);
    setError('');
    setModalOpen(true);
  }

  function handleOpenEdit(g: GoalRow) {
    setReadOnly(false);
    setIsEditing(true);
    setGoalId(g.id);
    setName(g.name);
    setGoalType(g.goalType);
    setTargetValue(g.targetValue);
    setStartDate(g.startDate?.slice(0, 10) || '');
    setEndDate(g.endDate?.slice(0, 10) || '');
    setSellerId(g.sellerId || '');
    setActive(g.active);
    setProgressiveTiers(
      Array.isArray(g.progressiveTiers) && g.progressiveTiers.length > 0
        ? g.progressiveTiers
        : [
            { name: 'Meta Base', value: 50000 },
            { name: 'Meta Principal', value: 70000 },
            { name: 'Alta Performance', value: 90000 },
            { name: 'Excepcional', value: 120000 },
          ],
    );
    setCommPercent(g.commissionRules?.percent ?? 0);
    setFixedValue(g.commissionRules?.fixedValue ?? 0);
    setCommType(g.commissionRules?.type ?? 'percent_revenue');
    setRequiresGoal(g.commissionRules?.requiresGoalReached ?? true);
    setError('');
    setModalOpen(true);
  }

  function handleDuplicate(g: GoalRow) {
    setReadOnly(false);
    setIsEditing(false);
    setGoalId('');
    setName(`${g.name} (Cópia)`);
    setGoalType(g.goalType);
    setTargetValue(g.targetValue);
    setStartDate(g.startDate?.slice(0, 10) || '');
    setEndDate(g.endDate?.slice(0, 10) || '');
    setSellerId(g.sellerId || '');
    setActive(true);
    setProgressiveTiers(g.progressiveTiers || []);
    setCommPercent(g.commissionRules?.percent ?? 0);
    setFixedValue(g.commissionRules?.fixedValue ?? 0);
    setCommType(g.commissionRules?.type ?? 'percent_revenue');
    setRequiresGoal(g.commissionRules?.requiresGoalReached ?? true);
    setError('');
    setModalOpen(true);
  }

  async function handleDelete(g: GoalRow) {
    const ok = await confirmDelete(`Deseja realmente remover a meta "${g.name}"?`);
    if (!ok) return;
    try {
      await apiDeleteGoal(g.id);
      await loadGoals();
    } catch (err: any) {
      alert(err.message || 'Falha ao excluir meta.');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        name: name.trim(),
        goalType,
        targetValue: Number(targetValue) || 0,
        startDate,
        endDate,
        sellerId: sellerId || null,
        active,
        progressiveTiers,
        commissionRules: {
          enabled: true,
          percent: Number(commPercent) || 0,
          type: commType,
          fixedValue,
          requiresGoalReached: requiresGoal,
        },
      };

      if (isEditing && goalId) {
        await apiUpdateGoal(goalId, payload);
      } else {
        await apiCreateGoal(payload);
      }

      setModalOpen(false);
      await loadGoals();
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar meta.');
    } finally {
      setSaving(false);
    }
  }

  // Meta Principal para o Topo do Dashboard
  const mainGoal = goals.find((g) => g.active) || goals[0];

  return (
    <div className="admin-page goals-page" style={{ padding: '16px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎯</span>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)' }}>
              Módulo de Metas & Comissões
            </h1>
            <span className="admin-badge admin-badge--active" style={{ fontSize: '0.75rem' }}>
              {getActiveStore()?.tradeName || 'Loja atual'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--mute)' }}>
            Configuração de metas de faturamento, lucro e vendas personalizadas por empresa, com níveis progressivos e comissões.
          </p>
        </div>

        <button
          type="button"
          className="admin-btn admin-btn--primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={handleOpenCreate}
        >
          <span>➕</span> Nova Meta
        </button>
      </div>

      {error && !modalOpen ? <p role="alert" className="qty-low">{error}</p> : null}
      {/* DASHBOARD DE METAS RESPONSIVO */}
      {mainGoal && (
        <div
          style={{
            background: 'var(--card, #171e27)',
            border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
            borderRadius: '10px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Meta em Destaque
              </span>
              <h2 style={{ margin: '2px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>
                {mainGoal.name} · {mainGoal.sellerName}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="admin-badge admin-badge--active">
                {mainGoal.goalType === 'profit' ? 'Meta por Lucro' : mainGoal.goalType === 'sales_count' ? 'Meta por Vendas' : 'Meta por Faturamento'}
              </span>
              {mainGoal.currentTierName && (
                <span className="admin-badge" style={{ background: '#3b82f6', color: '#fff' }}>
                  ⭐ {mainGoal.currentTierName}
                </span>
              )}
            </div>
          </div>

          {/* Barra de Progresso Visual */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
              <span>
                Realizado:{' '}
                <strong>
                  {mainGoal.goalType === 'sales_count'
                    ? `${mainGoal.realized} vendas`
                    : `R$ ${mainGoal.realized.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </strong>
              </span>
              <span>
                Meta:{' '}
                <strong>
                  {mainGoal.goalType === 'sales_count'
                    ? `${mainGoal.targetValue} vendas`
                    : `R$ ${mainGoal.targetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </strong>
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '14px',
                background: 'var(--card-2, #1c2430)',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, mainGoal.percent)}%`,
                  height: '100%',
                  background: mainGoal.percent >= 100 ? '#22c55e' : 'var(--accent, #2dd4bf)',
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>

          {/* Cards dos Indicadores */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
            }}
          >
            <div
              style={{
                background: 'var(--card-2, #1c2430)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Atingimento</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: mainGoal.percent >= 100 ? 'var(--goals-success)' : 'var(--accent, #2dd4bf)' }}>
                {mainGoal.percent}%
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-2, #1c2430)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Falta para a Meta</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: mainGoal.remaining > 0 ? 'var(--goals-danger)' : 'var(--goals-success)' }}>
                {mainGoal.remaining > 0
                  ? `R$ ${mainGoal.remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'Meta Batida! 🎉'}
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-2, #1c2430)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Vendas Realizadas</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink)' }}>
                {mainGoal.salesCount}
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-2, #1c2430)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Ticket Médio</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--ink)' }}>
                R$ {mainGoal.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div
              style={{
                background: 'var(--card-2, #1c2430)',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Comissão Mariana</span>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--goals-warning)' }}>
                R$ {mainGoal.commissionAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TABELA DE METAS CADASTRADAS (CRUD KIT COMPLETO) */}
      <div
        style={{
          background: 'var(--card, #171e27)',
          border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
          borderRadius: '10px',
          padding: '16px',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
          Metas Configuradas para a Empresa
        </h3>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mute)' }}>Carregando metas...</div>
        ) : goals.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--mute)' }}>
            Nenhuma meta cadastrada para esta empresa. Clique em <strong>"Nova Meta"</strong> para configurar.
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table" style={{ width: '100%', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th>Meta</th>
                  <th>Tipo</th>
                  <th>Valor Alvo</th>
                  <th>Realizado</th>
                  <th>% Atingido</th>
                  <th>Vendedor</th>
                  <th>Período</th>
                  <th>Situação</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <CrudNameButton onClick={() => handleOpenEdit(g)}>
                        <strong>{g.name}</strong>
                      </CrudNameButton>
                    </td>
                    <td>
                      {g.goalType === 'profit' ? 'Lucro' : g.goalType === 'sales_count' ? 'Qtd Vendas' : 'Faturamento'}
                    </td>
                    <td>R$ {g.targetValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 600, color: 'var(--accent, #2dd4bf)' }}>
                      R$ {g.realized.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          background: g.percent >= 100 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(45, 212, 191, 0.15)',
                          color: g.percent >= 100 ? 'var(--goals-success)' : 'var(--accent, #2dd4bf)',
                        }}
                      >
                        {g.percent}%
                      </span>
                    </td>
                    <td>{g.sellerName}</td>
                    <td>
                      {new Date(g.startDate).toLocaleDateString('pt-BR')} até{' '}
                      {new Date(g.endDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td>
                      <span className={g.active ? 'admin-badge admin-badge--active' : 'admin-badge'}>
                        {g.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                      <CrudRowActions
                        onView={() => {handleOpenEdit(g);setReadOnly(true);}}
                        onEdit={() => handleOpenEdit(g)}
                        onDuplicate={() => handleDuplicate(g)}
                        onDelete={() => handleDelete(g)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE METAS */}
      {modalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="admin-modal admin-modal--lg" role="dialog" aria-modal="true" aria-label={readOnly ? 'Consultar meta' : 'Configurar meta'}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px', width: '95vw' }}
          >
            <div className="admin-modal__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 700 }}>
                {readOnly ? 'Consultar meta' : isEditing ? 'Editar Configuração de Meta' : 'Nova Configuração de Meta'}
              </h3>
              <button className="admin-btn admin-btn--icon" onClick={() => setModalOpen(false)} title="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave}>
              <fieldset disabled={readOnly || saving} style={{border:0,padding:0,margin:0,minWidth:0}}>
              <div className="admin-modal__body" style={{ padding: '16px', maxHeight: '76vh', overflowY: 'auto' }}>
                {error && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: 'var(--goals-danger)',
                      border: '1px solid #ef4444',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.84rem',
                      marginBottom: '12px',
                    }}
                  >
                    {error}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="admin-label">Nome da Meta</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Outubro 2026"
                      required
                    />
                  </div>
                  <div>
                    <AdminPicker
                      label="Tipo da Meta"
                      value={goalType}
                      options={[
                        { value: 'revenue', label: 'Faturamento (Vendas)' },
                        { value: 'profit', label: 'Lucro Líquido' },
                        { value: 'sales_count', label: 'Qtd de Vendas' },
                      ]}
                      onChange={(val: any) => setGoalType(val)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="admin-label">Valor da Meta (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="admin-input"
                      value={targetValue}
                      onChange={(e) => setTargetValue(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div>
                    <label className="admin-label">Data Inicial</label>
                    <input
                      type="date"
                      className="admin-input"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="admin-label">Data Final</label>
                    <input
                      type="date"
                      className="admin-input"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <label className="admin-label">Vendedor ou Equipe</label>
                    <AdminPicker label="Vendedor" value={sellerId}
                      options={[{value: '', label: 'Toda a equipe'}, ...sellers.map(s => ({value: s.id, label: s.name}))]}
                      onChange={setSellerId} />
                  </div>
                  <div>
                    <AdminPicker
                      label="Situação"
                      value={active ? 'active' : 'inactive'}
                      options={[
                        { value: 'active', label: 'Ativa' },
                        { value: 'inactive', label: 'Inativa' },
                      ]}
                      onChange={(val) => setActive(val === 'active')}
                    />
                  </div>
                </div>

                {/* NÍVEIS PROGRESSIVOS (NÃO HARDCODED) */}
                <div
                  style={{
                    background: 'var(--card-2, #1c2430)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                    📈 Níveis de Meta Progressiva
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <button type="button" className="admin-btn" onClick={() => setProgressiveTiers([...progressiveTiers,{name:'',value:0}])}>Adicionar nível</button>
                    {progressiveTiers.map((tier, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="admin-input"
                          style={{ flex: 1, fontSize: '0.84rem' }}
                          value={tier.name}
                          onChange={(e) => {
                            const newTiers = [...progressiveTiers];
                            newTiers[idx].name = e.target.value;
                            setProgressiveTiers(newTiers);
                          }}
                        />
                        <input
                          type="number"
                          className="admin-input"
                          style={{ width: '100px', fontSize: '0.84rem' }}
                          value={tier.value}
                          onChange={(e) => {
                            const newTiers = [...progressiveTiers];
                            newTiers[idx].value = Number(e.target.value);
                            setProgressiveTiers(newTiers);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* REGRA DE COMISSÃO */}
                <div
                  style={{
                    background: 'var(--card-2, #1c2430)',
                    border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                    💼 Regra de Comissão da Empresa
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                    <div>
                      <AdminPicker label="Base da comissão" value={commType} options={[
                       {value:'percent_revenue',label:'Percentual do faturamento'},
                       {value:'percent_profit',label:'Percentual do lucro'},
                       {value:'fixed_value',label:'Valor fixo'}]}
                       onChange={value => setCommType(value as typeof commType)} />
                      <label className="admin-label">{commType === 'fixed_value' ? 'Valor da comissão (R$)' : 'Taxa de comissão (%)'}</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max={commType === 'fixed_value' ? undefined : 100}
                        className="admin-input"
                        value={commType === 'fixed_value' ? fixedValue : commPercent}
                        onChange={(e) => commType === 'fixed_value' ? setFixedValue(Number(e.target.value)) : setCommPercent(Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <AdminPicker
                        label="Gatilho de Pagamento"
                        value={requiresGoal ? 'goal_reached' : 'always'}
                        options={[
                          { value: 'goal_reached', label: 'Somente após atingir a meta' },
                          { value: 'always', label: 'Sobre todas as vendas' },
                        ]}
                        onChange={(val) => setRequiresGoal(val === 'goal_reached')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              </fieldset>
              <div
                className="admin-modal__foot"
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  padding: '12px 16px',
                  borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                }}
              >
                <button type="button" className="admin-btn admin-btn--secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || readOnly}>
                  {saving ? 'Gravando...' : 'Salvar Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
