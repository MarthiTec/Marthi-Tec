import { useEffect, useState } from 'react';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import {
  calculateLicensingSummary,
  deleteStore,
  getActiveStoreId,
  getClientAccount,
  hydrateMultiStoreFromApi,
  listStores,
  saveStore,
  setActiveStoreId,
  MULTI_STORE_CHANGED_EVENT,
  STORE_CONTEXT_CHANGED_EVENT,
  type ClientAccount,
  type Store,
  type StoreTaxRegime,
} from '../../data/multiStoreStore';
import { isNestAuthed } from '../../services/nestClient';
import { apiCreateStore, apiDeleteStore, apiUpdateStore } from '../../services/erpApi';
import { applySegmentPreset, type StoreSegmentId } from '../../data/storeSegment';
import {
  executeStoreReplication,
  getReplicationLogs,
  REPLICATION_EVENT,
  type ReplicationLog,
} from '../../data/storeReplicationStore';
import './multiStore.css';

type Tab = 'stores' | 'licensing' | 'isolation';

const STORE_SEGMENT_OPTIONS = [
  { value: 'assistencia_tecnica', label: '🔧 Oficina & Assistência Técnica' },
  { value: 'vestuario_moda', label: '👗 Moda, Vestuário & Calçados' },
  { value: 'restaurante_gastronomia', label: '🍔 Restaurante, Bar & Gastronomia' },
  { value: 'varejo_geral', label: '🛒 Varejo Geral, Mercado & Utilidades' },
  { value: 'prestador_servicos', label: '📋 Prestador de Serviços Gerais' },
  { value: 'personalizado', label: '⚙️ Personalizado (Campos Manuais)' },
];

const TAX_REGIME_OPTIONS = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'Microempreendedor Individual (MEI)' },
];

export function MultiStoreManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('stores');
  const [stores, setStores] = useState<Store[]>(() => listStores());
  const [clientAccount, setClientAccount] = useState<ClientAccount>(() => getClientAccount());
  const [activeStoreId, setActiveStore] = useState<string>(() => getActiveStoreId());
  const [licensingSummary, setLicensingSummary] = useState(() => calculateLicensingSummary());

  // Modal Loja
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Partial<Store>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Estados de Replicação entre Filiais
  const [repSourceId, setRepSourceId] = useState<string>(() => stores[0]?.id || '');
  const [repTargetId, setRepTargetId] = useState<string>(() => (stores.length > 1 ? stores[1]?.id : ''));
  const [repProducts, setRepProducts] = useState(true);
  const [repResetStockQty, setRepResetStockQty] = useState(false);
  const [repCustomers, setRepCustomers] = useState(true);
  const [repSellers, setRepSellers] = useState(true);
  const [repCampaigns, setRepCampaigns] = useState(true);
  const [repExecuting, setRepExecuting] = useState(false);
  const [repFeedback, setRepFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [repLogs, setRepLogs] = useState<ReplicationLog[]>(() => getReplicationLogs());
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      const freshStores = listStores();
      setStores(freshStores);
      setClientAccount(getClientAccount());
      setActiveStore(getActiveStoreId());
      setLicensingSummary(calculateLicensingSummary());
      setRepLogs(getReplicationLogs());

      if (freshStores.length > 0) {
        setRepSourceId((prev) => (prev && freshStores.some((s) => s.id === prev) ? prev : freshStores[0].id));
        setRepTargetId((prev) => {
          if (prev && freshStores.some((s) => s.id === prev) && prev !== freshStores[0].id) return prev;
          const other = freshStores.find((s) => s.id !== freshStores[0].id);
          return other ? other.id : '';
        });
      }
    }

    hydrateMultiStoreFromApi().then(() => {
      refresh();
    });

    window.addEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    window.addEventListener(REPLICATION_EVENT, refresh);
    return () => {
      window.removeEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
      window.removeEventListener(REPLICATION_EVENT, refresh);
    };
  }, []);

  async function handleExecuteReplication() {
    if (!repSourceId || !repTargetId) {
      setRepFeedback({ type: 'error', message: 'Selecione a Loja de Origem e a Loja de Destino.' });
      return;
    }
    if (repSourceId === repTargetId) {
      setRepFeedback({ type: 'error', message: 'A Loja de Origem e a Loja de Destino devem ser diferentes.' });
      return;
    }
    if (!repProducts && !repCustomers && !repSellers && !repCampaigns) {
      setRepFeedback({
        type: 'error',
        message: 'Selecione ao menos um módulo para replicar (Produtos, Clientes, Vendedores ou Campanhas).',
      });
      return;
    }

    setRepExecuting(true);
    setRepFeedback(null);
    try {
      const res = await executeStoreReplication({
        sourceStoreId: repSourceId,
        targetStoreId: repTargetId,
        modules: {
          products: repProducts,
          resetStockQty: repResetStockQty,
          customers: repCustomers,
          sellers: repSellers,
          campaigns: repCampaigns,
        },
        operatorName: clientAccount.tradeName || clientAccount.legalName || 'Administrador',
      });
      setRepFeedback({ type: 'success', message: res.message });
      setRepLogs(getReplicationLogs());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na replicação de dados entre filiais.';
      setRepFeedback({ type: 'error', message: msg });
    } finally {
      setRepExecuting(false);
    }
  }

  function handleCopyToken(token?: string, storeId?: string) {
    if (!token) return;
    void navigator.clipboard.writeText(token);
    if (storeId) {
      setCopiedTokenId(storeId);
      setTimeout(() => setCopiedTokenId(null), 3000);
    }
  }

  function handleOpenCreate() {
    setEditingStore({
      name: '',
      tradeName: '',
      cnpj: '',
      stateRegistration: '',
      municipalRegistration: '',
      email: '',
      phone: '',
      zipCode: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: 'RJ',
      ibgeCityCode: '',
      taxRegime: 'simples_nacional',
      segmentId: 'assistencia_tecnica',
      active: true,
      isMatrix: stores.length === 0,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function handleOpenEdit(store: Store) {
    setEditingStore({ ...store });
    setFormError(null);
    setModalOpen(true);
  }

  function handleDuplicate(store: Store) {
    setEditingStore({
      ...store,
      id: undefined,
      accessToken: undefined,
      code: '',
      name: `${store.name} (Cópia)`,
      tradeName: `${store.tradeName} (Cópia)`,
      cnpj: '',
      isMatrix: false,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleDelete(storeId: string) {
    const s = stores.find((it) => it.id === storeId);
    if (!s) return;
    if (s.isMatrix && stores.length > 1) {
      alert('A Loja Matriz não pode ser excluída enquanto houver outras filiais cadastradas.');
      return;
    }
    if (confirmDelete(`Deseja realmente remover a loja "${s.name}" (CNPJ: ${s.cnpj})?`)) {
      deleteStore(storeId);
      if (isNestAuthed()) {
        await apiDeleteStore(storeId).catch((err) => console.warn('Falha ao remover loja da API', err));
      }
    }
  }

  async function handleSaveStore() {
    if (!editingStore.name?.trim()) {
      setFormError('Informe a Razão Social ou Nome da Loja.');
      return;
    }
    if (!editingStore.cnpj?.trim()) {
      setFormError('Informe o CNPJ da Loja/Filial.');
      return;
    }

    try {
      const saved = saveStore({
        ...editingStore,
        name: editingStore.name.trim(),
        cnpj: editingStore.cnpj.trim(),
        segmentId: editingStore.segmentId || 'assistencia_tecnica',
      });
      applySegmentPreset(saved.segmentId || 'assistencia_tecnica', saved.id);

      if (isNestAuthed()) {
        const payload = {
          tradeName: saved.tradeName,
          legalName: saved.name,
          document: saved.cnpj,
          email: saved.email,
          phone: saved.phone,
          stateRegistration: saved.stateRegistration,
          municipalRegistration: saved.municipalRegistration,
          zipCode: saved.zipCode,
          street: saved.street,
          number: saved.number,
          complement: saved.complement,
          district: saved.neighborhood,
          city: saved.city,
          state: saved.state,
          taxRegime: saved.taxRegime,
          isMatrix: saved.isMatrix,
          active: saved.active,
        };
        if (editingStore.id) {
          await apiUpdateStore(editingStore.id, payload).catch((err) =>
            console.warn('Falha ao atualizar filial na API', err),
          );
        } else {
          await apiCreateStore(payload).catch((err) =>
            console.warn('Falha ao criar filial na API', err),
          );
        }
      }

      setModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar loja.';
      setFormError(msg);
    }
  }

  return (
    <div className="multi-store-page">
      <header className="multi-store-header">
        <div className="multi-store-header__info">
          <h1>
            <span aria-hidden>🏢</span> Multi-Loja & Licenciamento por CNPJ
          </h1>
          <p className="multi-store-header__subtitle">
            Gestão de filiais, isolamento de dados operacionais e precificação escalável com desconto multi-loja.
          </p>
        </div>

        <div className="multi-store-account-card">
          <div className="multi-store-account-card__tag">Conta Comercial Contratante</div>
          <strong className="multi-store-account-card__name">{clientAccount.legalName}</strong>
          <span className="multi-store-account-card__doc">
            Doc Titular: {clientAccount.document} · {stores.filter((s) => s.active).length} Lojas Ativas
          </span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="multi-store-tabs" aria-label="Abas de Gestão Multi-Loja">
        <button
          type="button"
          className={`multi-store-tab ${activeTab === 'stores' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('stores')}
        >
          <AdminIcon name="store" />
          Lojas & CNPJs ({stores.length})
        </button>
        <button
          type="button"
          className={`multi-store-tab ${activeTab === 'licensing' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('licensing')}
        >
          <AdminIcon name="fiscal" />
          Licenciamento por CNPJ & Descontos
        </button>
        <button
          type="button"
          className={`multi-store-tab ${activeTab === 'isolation' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('isolation')}
        >
          <AdminIcon name="restore" />
          Isolamento & Replicação entre Filiais
        </button>
      </nav>

      {/* TAB 1: LOJAS */}
      {activeTab === 'stores' && (
        <section className="multi-store-section">
          <div className="multi-store-actions-bar">
            <div className="multi-store-search-info">
              Exibindo <strong>{stores.length}</strong> loja(s) vinculadas à conta comercial.
            </div>
            <button type="button" className="multi-store-btn-primary" onClick={handleOpenCreate}>
              + Nova Loja / Filial
            </button>
          </div>

          <div className="multi-store-table-container admin-table-container">
            <table className="multi-store-table">
              <thead>
                <tr>
                  <th>Cód</th>
                  <th>Loja / Razão Social</th>
                  <th>CNPJ</th>
                  <th>Token de Acesso</th>
                  <th>Ramo / Segmento</th>
                  <th>Inscrições (IE / IM)</th>
                  <th>Cidade / UF</th>
                  <th>Regime Tributário</th>
                  <th>Status</th>
                  <th>Contexto</th>
                  <th style={{ width: 140 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const isCurrent = s.id === activeStoreId;
                  return (
                    <tr key={s.id} className={isCurrent ? 'is-row-active' : undefined}>
                      <td>
                        <span className="multi-store-code">{s.code}</span>
                      </td>
                      <td>
                        <div className="multi-store-cell-name">
                          <CrudNameButton onClick={() => handleOpenEdit(s)}>{s.name}</CrudNameButton>
                          <span className="multi-store-cell-trade">{s.tradeName}</span>
                          {s.isMatrix && <span className="multi-store-badge-matrix">Matriz</span>}
                        </div>
                      </td>
                      <td>
                        <code className="multi-store-cnpj">{s.cnpj}</code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code
                            style={{
                              fontSize: '0.74rem',
                              color: '#4ade80',
                              background: 'rgba(74, 222, 128, 0.12)',
                              padding: '3px 6px',
                              borderRadius: 4,
                              fontFamily: 'monospace',
                            }}
                          >
                            {s.accessToken ? `${s.accessToken.slice(0, 11)}…` : '—'}
                          </code>
                          {s.accessToken && (
                            <button
                              type="button"
                              className="multi-store-btn-switch"
                              style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                              onClick={() => handleCopyToken(s.accessToken, s.id)}
                              title="Copiar Token de Acesso da Empresa / Filial"
                            >
                              {copiedTokenId === s.id ? '✓ Copiado' : 'Copiar'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="multi-store-regime" style={{ fontWeight: 650 }}>
                          {STORE_SEGMENT_OPTIONS.find((o) => o.value === (s.segmentId || 'assistencia_tecnica'))?.label || '🔧 Oficina'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', lineHeight: 1.35 }}>
                          <div><strong>IE:</strong> {s.stateRegistration || 'ISENTO'}</div>
                          <div style={{ color: 'var(--admin-muted, #94a3b8)' }}><strong>IM:</strong> {s.municipalRegistration || '—'}</div>
                        </div>
                      </td>
                      <td>
                        {s.city} / {s.state}
                      </td>
                      <td>
                        <span className="multi-store-regime">
                          {TAX_REGIME_OPTIONS.find((o) => o.value === s.taxRegime)?.label || s.taxRegime}
                        </span>
                      </td>
                      <td>
                        <span className={`multi-store-status-pill ${s.active ? 'is-active' : 'is-inactive'}`}>
                          {s.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td>
                        {isCurrent ? (
                          <span className="multi-store-badge-current">✓ Loja Selecionada</span>
                        ) : (
                          <button
                            type="button"
                            className="multi-store-btn-switch"
                            onClick={() => setActiveStoreId(s.id)}
                            disabled={!s.active}
                            title="Alternar contexto operacional para esta loja"
                          >
                            Alternar para esta
                          </button>
                        )}
                      </td>
                      <td>
                        <CrudRowActions
                          onView={() => handleOpenEdit(s)}
                          onEdit={() => handleOpenEdit(s)}
                          onDuplicate={() => handleDuplicate(s)}
                          onDelete={() => handleDelete(s.id)}
                          canDelete={!s.isMatrix || stores.length === 1}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: LICENCIAMENTO */}
      {activeTab === 'licensing' && (
        <section className="multi-store-section">
          <div
            style={{
              padding: '12px 18px',
              borderRadius: '12px',
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.88rem',
              color: 'var(--admin-text, #1e293b)',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
            <div>
              <strong>Política Comercial de Licenciamento & Descontos Multi-Loja:</strong> As regras de desconto progressivo por quantidade de CNPJs ativos são gerenciadas centralmente pela equipe <strong>Marthi Tecnologia</strong>. Quaisquer faixas e condições acordadas são calculadas e aplicadas automaticamente no demonstrativo abaixo.
            </div>
          </div>

          <div className="multi-store-licensing-overview">
            <div className="multi-store-stat-card">
              <span className="multi-store-stat-label">Total de Lojas Contratadas</span>
              <strong className="multi-store-stat-value">{licensingSummary.activeStores}</strong>
              <span className="multi-store-stat-sub">
                {licensingSummary.activeStores === 1 ? 'Loja Individual' : 'Rede Multi-Loja'}
              </span>
            </div>

            <div className="multi-store-stat-card">
              <span className="multi-store-stat-label">Regra Multi-Loja Aplicada</span>
              <strong className="multi-store-stat-value" style={{ fontSize: '1.1rem' }}>
                {licensingSummary.applicableRule ? licensingSummary.applicableRule.name : 'Tabela Padrão (Sem desconto)'}
              </strong>
              <span className="multi-store-stat-sub">
                {licensingSummary.applicableRule?.notes || 'Calculado automaticamente por faixas'}
              </span>
            </div>

            <div className="multi-store-stat-card multi-store-stat-card--highlight">
              <span className="multi-store-stat-label">Total Mensal da Conta</span>
              <strong className="multi-store-stat-value" style={{ color: '#16a34a' }}>
                R$ {licensingSummary.totalFinal.toFixed(2).replace('.', ',')}
              </strong>
              <span className="multi-store-stat-sub">
                {licensingSummary.totalDiscount > 0 ? (
                  <span style={{ color: '#15803d', fontWeight: 600 }}>
                    Economia de R$ {licensingSummary.totalDiscount.toFixed(2).replace('.', ',')} / mês
                  </span>
                ) : (
                  'Preço base sem desconto'
                )}
              </span>
            </div>
          </div>

          <div className="multi-store-card">
            <div className="multi-store-card__header">
              <h3>Detalhamento de Licenças por CNPJ</h3>
              <p>Cada CNPJ/filial possui sua própria licença com garantia de isolamento operacional.</p>
            </div>

            <div className="multi-store-table-container admin-table-container">
              <table className="multi-store-table">
                <thead>
                  <tr>
                    <th>Loja / Filial</th>
                    <th>CNPJ</th>
                    <th>Tipo</th>
                    <th>Valor Base</th>
                    <th>Desconto Multi-Loja</th>
                    <th>Valor Mensal Final</th>
                    <th>Status da Licença</th>
                  </tr>
                </thead>
                <tbody>
                  {licensingSummary.items.map((item) => (
                    <tr key={item.store.id}>
                      <td>
                        <strong>{item.store.name}</strong>
                      </td>
                      <td>
                        <code>{item.store.cnpj}</code>
                      </td>
                      <td>{item.isMatrix ? <span className="multi-store-badge-matrix">Matriz</span> : 'Filial'}</td>
                      <td>R$ {item.basePrice.toFixed(2).replace('.', ',')}</td>
                      <td>
                        {item.discountValue > 0 ? (
                          <span className="multi-store-discount-pill">
                            -{item.discountPercent}% (-R$ {item.discountValue.toFixed(2).replace('.', ',')})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--admin-muted)' }}>0% (Base)</span>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: '#16a34a' }}>
                          R$ {item.finalPrice.toFixed(2).replace('.', ',')}
                        </strong>
                      </td>
                      <td>
                        <span className="multi-store-status-pill is-active">Ativa / Em Dia</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--admin-surface-subtle)', fontWeight: 'bold' }}>
                    <td colSpan={3}>TOTAL MENSAL CONSOLIDADO</td>
                    <td>R$ {licensingSummary.totalBase.toFixed(2).replace('.', ',')}</td>
                    <td style={{ color: '#dc2626' }}>
                      {licensingSummary.totalDiscount > 0
                        ? `- R$ ${licensingSummary.totalDiscount.toFixed(2).replace('.', ',')}`
                        : 'R$ 0,00'}
                    </td>
                    <td style={{ color: '#16a34a', fontSize: '1.05rem' }}>
                      R$ {licensingSummary.totalFinal.toFixed(2).replace('.', ',')}
                    </td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: ISOLAMENTO & REPLICAÇÃO DE DADOS */}
      {activeTab === 'isolation' && (
        <section className="multi-store-section" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Card Principal: Central de Replicação de Cadastros */}
          <div className="multi-store-card">
            <div className="multi-store-card__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.5rem' }}>🔄</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--admin-text)' }}>
                    Central de Replicação & Sincronização entre Filiais
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--admin-muted)' }}>
                    Replique cadastros de <strong>Produtos</strong>, <strong>Clientes</strong>, <strong>Vendedores</strong> e{' '}
                    <strong>Campanhas</strong> da matriz para as filiais (ou entre filiais do mesmo grupo).
                  </p>
                </div>
              </div>
            </div>

            {repFeedback && (
              <div
                style={{
                  margin: '16px 20px 0',
                  padding: '12px 16px',
                  borderRadius: 8,
                  fontSize: '0.88rem',
                  fontWeight: 500,
                  background: repFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: repFeedback.type === 'success' ? '#16a34a' : '#ef4444',
                  border: `1px solid ${repFeedback.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                }}
              >
                {repFeedback.type === 'success' ? '✓ ' : '⚠️ '} {repFeedback.message}
              </div>
            )}

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Seleção de Lojas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div>
                  <AdminPicker
                    label="1. Loja de Origem (Copiar de onde?)"
                    value={repSourceId}
                    options={stores.map((s) => ({
                      value: s.id,
                      label: `${s.isMatrix ? '🏢 [Matriz] ' : '🏬 '}${s.tradeName || s.name} (${s.cnpj})`,
                    }))}
                    onChange={(val) => setRepSourceId(val)}
                  />
                  <small style={{ color: 'var(--admin-muted)', fontSize: '0.76rem', display: 'block', marginTop: 4 }}>
                    A loja com os cadastros que servirão de base.
                  </small>
                </div>

                <div>
                  <AdminPicker
                    label="2. Loja de Destino (Para qual filial enviar?)"
                    value={repTargetId}
                    options={stores
                      .filter((s) => s.id !== repSourceId)
                      .map((s) => ({
                        value: s.id,
                        label: `${s.isMatrix ? '🏢 [Matriz] ' : '🏬 '}${s.tradeName || s.name} (${s.cnpj})`,
                      }))}
                    onChange={(val) => setRepTargetId(val)}
                  />
                  <small style={{ color: 'var(--admin-muted)', fontSize: '0.76rem', display: 'block', marginTop: 4 }}>
                    A filial receptora que receberá as informações sincronizadas.
                  </small>
                </div>
              </div>

              {/* Módulos Permitidos para Replicação */}
              <div
                style={{
                  background: 'var(--admin-surface-subtle, rgba(241, 245, 249, 0.5))',
                  border: '1px solid var(--admin-border, #e2e8f0)',
                  borderRadius: 10,
                  padding: '16px',
                }}
              >
                <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', color: 'var(--admin-text)' }}>
                  3. Selecione os cadastros a serem replicados:
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={repProducts}
                      onChange={(e) => setRepProducts(e.target.checked)}
                      style={{ marginTop: 3, width: 16, height: 16 }}
                    />
                    <div>
                      <strong style={{ fontSize: '0.88rem', display: 'block' }}>📦 Produtos & Catálogo de Estoque</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--admin-muted)' }}>
                        SKUs, códigos de barras, preços de venda, custos e fotos de produtos.
                      </span>
                      {repProducts && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={repResetStockQty}
                            onChange={(e) => setRepResetStockQty(e.target.checked)}
                            style={{ width: 14, height: 14 }}
                          />
                          <span style={{ fontSize: '0.74rem', color: '#2563eb' }}>
                            Zerar quantidade na filial (para contagem de balanço inicial)
                          </span>
                        </label>
                      )}
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={repCustomers}
                      onChange={(e) => setRepCustomers(e.target.checked)}
                      style={{ marginTop: 3, width: 16, height: 16 }}
                    />
                    <div>
                      <strong style={{ fontSize: '0.88rem', display: 'block' }}>👥 Clientes & Contatos</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--admin-muted)' }}>
                        Base de clientes, telefones, e-mails, endereços e histórico de contato.
                      </span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={repSellers}
                      onChange={(e) => setRepSellers(e.target.checked)}
                      style={{ marginTop: 3, width: 16, height: 16 }}
                    />
                    <div>
                      <strong style={{ fontSize: '0.88rem', display: 'block' }}>💼 Vendedores & Comissões</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--admin-muted)' }}>
                        Equipe comercial e taxas de comissão para fechamento de vendas.
                      </span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={repCampaigns}
                      onChange={(e) => setRepCampaigns(e.target.checked)}
                      style={{ marginTop: 3, width: 16, height: 16 }}
                    />
                    <div>
                      <strong style={{ fontSize: '0.88rem', display: 'block' }}>🏷️ Campanhas & Tabelas de Preço</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--admin-muted)' }}>
                        Promoções vigentes, regras de atacado e condições de pagamento.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* SEGURANÇA E ISOLAMENTO ESTREITO (NUNCA REPLICÁVEIS) */}
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                <div>
                  <strong style={{ color: '#dc2626', fontSize: '0.88rem', display: 'block', marginBottom: 2 }}>
                    Segregação Rígida de Caixa e OS (100% Individuais e Intransferíveis)
                  </strong>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--admin-muted)', lineHeight: 1.45 }}>
                    Por conformidade fiscal e auditoria comercial, o <strong>Sistema de Caixa / PDV</strong> (sessões de caixa, saldo, sangrias e suprimentos) e o <strong>Sistema de Ordens de Serviço (OS)</strong> (aparelhos na bancada, diagnósticos técnicos, senhas de clientes e termos de garantia) são <strong>estritamente individuais por filial</strong> e nunca são misturados ou replicados.
                  </p>
                </div>
              </div>

              {/* Botão de Ação */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                  type="button"
                  className="multi-store-btn-primary"
                  onClick={handleExecuteReplication}
                  disabled={repExecuting || !repSourceId || !repTargetId || repSourceId === repTargetId}
                  style={{ minWidth: 260, padding: '12px 22px', fontSize: '0.95rem' }}
                >
                  {repExecuting ? 'Processando Replicação…' : '🚀 Executar Replicação entre Filiais'}
                </button>
              </div>
            </div>

            {/* Histórico de Replicações Recentes */}
            {repLogs.length > 0 && (
              <div style={{ borderTop: '1px solid var(--admin-border, #e2e8f0)', padding: '18px 20px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'var(--admin-text)' }}>
                  Auditoria de Replicações Realizadas:
                </h4>
                <div className="multi-store-table-container admin-table-container">
                  <table className="multi-store-table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Data / Hora</th>
                        <th>Loja Origem</th>
                        <th>Loja Destino</th>
                        <th>Produtos</th>
                        <th>Clientes</th>
                        <th>Vendedores</th>
                        <th>Campanhas</th>
                        <th>Operador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repLogs.slice(0, 5).map((log) => (
                        <tr key={log.id}>
                          <td>{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                          <td><strong>{log.sourceStoreName}</strong></td>
                          <td><strong>{log.targetStoreName}</strong></td>
                          <td>{log.productsCount > 0 ? `+${log.productsCount}` : '—'}</td>
                          <td>{log.customersCount > 0 ? `+${log.customersCount}` : '—'}</td>
                          <td>{log.sellersCount > 0 ? `+${log.sellersCount}` : '—'}</td>
                          <td>{log.campaignsCount > 0 ? `+${log.campaignsCount}` : '—'}</td>
                          <td>{log.operatorName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Matriz de Garantia de Isolamento de Dados */}
          <div className="multi-store-card">
            <div className="multi-store-card__header">
              <h3>Matriz de Isolamento e Conformidade por CNPJ</h3>
              <p>
                Cada módulo do sistema Marthi opera estritamente sob o escopo da <code>store_id</code> selecionada.
              </p>
            </div>

            <div className="multi-store-isolation-grid">
              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">📦</span>
                <strong>Estoque & Almoxarifado</strong>
                <p>
                  Saldos físicos, movimentações Kardex e contagens de balanço são 100% segregados por filial.
                  Transferências entre lojas geram rastreamento com baixa em uma e entrada na outra.
                </p>
              </div>

              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">💳</span>
                <strong>Caixa & PDV (Estritamente Individual)</strong>
                <p>
                  Terminais de venda, abertura e fechamento de sessões, sangrias, suprimentos e vendas (inclusive Venda
                  Avulsa) pertencem exclusivamente ao caixa e CNPJ da loja atual.
                </p>
              </div>

              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">🛠️</span>
                <strong>Ordens de Serviço / OS (Estritamente Individual)</strong>
                <p>
                  Equipamentos recebidos, diagnósticos, senhas (desenho/texto), garantias de peças/mão de obra e
                  assinaturas digitais são vinculadas à oficina e equipe técnica da loja emissora.
                </p>
              </div>

              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">💰</span>
                <strong>Financeiro & Tesouraria</strong>
                <p>
                  Contas a pagar e receber, conciliação bancária, boletos e plano de contas segregados por CNPJ, com
                  opção de consolidação corporativa na Retaguarda Matriz.
                </p>
              </div>

              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">🏷️</span>
                <strong>Campanhas & Orçamentos</strong>
                <p>
                  Campanhas promocionais podem ser globais da rede ou exclusivas de uma filial. Orçamentos negociados
                  congelam condições comerciais no momento da criação.
                </p>
              </div>

              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">👥</span>
                <strong>Usuários & Operadores</strong>
                <p>
                  Operadores podem ser alocados em uma loja fixa ou possuir permissão multi-loja (como gerentes de rede),
                  trocando de contexto a qualquer momento pelo cabeçalho do sistema.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* MODAL EDITAR / CRIAR LOJA */}
      {modalOpen && (
        <div className="multi-store-modal-backdrop" role="dialog" aria-modal="true">
          <div className="multi-store-modal">
            <div className="multi-store-modal__header">
              <h2>{editingStore.id ? 'Editar Loja / Filial' : 'Cadastrar Nova Loja / Filial'}</h2>
              <button
                type="button"
                className="multi-store-modal__close"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {formError && <div className="multi-store-alert-error">{formError}</div>}

            <div className="multi-store-modal__body">
              <div className="multi-store-form-row">
                <label className="multi-store-form-field">
                  <span>Código da Loja</span>
                  <input
                    type="text"
                    value={editingStore.code || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, code: e.target.value })}
                    placeholder="Ex: 001"
                  />
                </label>

                <label className="multi-store-form-field span-2">
                  <span>Razão Social *</span>
                  <input
                    type="text"
                    value={editingStore.name || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })}
                    placeholder="Ex: Marthi Comércio de Eletrônicos Ltda"
                    required
                  />
                </label>
              </div>

              <div className="multi-store-form-row">
                <label className="multi-store-form-field">
                  <span>Nome Fantasia</span>
                  <input
                    type="text"
                    value={editingStore.tradeName || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, tradeName: e.target.value })}
                    placeholder="Ex: Marthi Tech Centro"
                  />
                </label>

                <label className="multi-store-form-field">
                  <span>CNPJ da Loja *</span>
                  <input
                    type="text"
                    value={editingStore.cnpj || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    required
                  />
                </label>

                <label className="multi-store-form-field">
                  <span>Inscrição Estadual (IE)</span>
                  <input
                    type="text"
                    value={editingStore.stateRegistration || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, stateRegistration: e.target.value })}
                    placeholder="Isento ou numeração"
                  />
                </label>

                <label className="multi-store-form-field">
                  <span>Inscrição Municipal (IM)</span>
                  <input
                    type="text"
                    value={editingStore.municipalRegistration || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, municipalRegistration: e.target.value })}
                    placeholder="Número do alvará / IM"
                  />
                </label>
              </div>

              <div className="multi-store-form-row">
                <label className="multi-store-form-field span-2">
                  <span>Token de Acesso da Loja / Filial (CNPJ & E-mail)</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={editingStore.accessToken || '(Gerado automaticamente ao salvar)'}
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        color: '#4ade80',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        letterSpacing: '0.5px',
                      }}
                    />
                    {editingStore.accessToken && (
                      <button
                        type="button"
                        className="multi-store-btn-switch"
                        style={{ whiteSpace: 'nowrap', padding: '8px 14px' }}
                        onClick={() => {
                          void navigator.clipboard.writeText(editingStore.accessToken || '');
                          alert('✓ Token de acesso copiado com sucesso!');
                        }}
                      >
                        Copiar Token
                      </button>
                    )}
                  </div>
                  <small style={{ color: 'var(--admin-muted, #94a3b8)', marginTop: 4, display: 'block', fontSize: '0.75rem' }}>
                    Token seguro exclusivo por CNPJ/E-mail que isola os módulos (Totem, Retaguarda, OS, PDV, Fiscal e E-commerce).
                  </small>
                </label>
              </div>

              <div className="multi-store-form-row">
                <div className="multi-store-form-field">
                  <AdminPicker
                    label="Ramo de Atividade da Loja *"
                    value={editingStore.segmentId || 'assistencia_tecnica'}
                    options={STORE_SEGMENT_OPTIONS}
                    onChange={(val) => setEditingStore({ ...editingStore, segmentId: val as StoreSegmentId })}
                  />
                </div>

                <div className="multi-store-form-field">
                  <AdminPicker
                    label="Regime Tributário"
                    value={editingStore.taxRegime || 'simples_nacional'}
                    options={TAX_REGIME_OPTIONS}
                    onChange={(val) => setEditingStore({ ...editingStore, taxRegime: val as StoreTaxRegime })}
                  />
                </div>

                <label className="multi-store-form-field">
                  <span>E-mail da Loja</span>
                  <input
                    type="email"
                    value={editingStore.email || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, email: e.target.value })}
                    placeholder="filial@empresa.com.br"
                  />
                </label>

                <label className="multi-store-form-field">
                  <span>Telefone / WhatsApp</span>
                  <input
                    type="text"
                    value={editingStore.phone || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, phone: e.target.value })}
                    placeholder="(11) 90000-0000"
                  />
                </label>
              </div>

              <h4 style={{ margin: '14px 0 6px', fontSize: '0.9rem', color: 'var(--admin-text)' }}>
                Endereço Operacional & Localização
              </h4>

              <div className="multi-store-form-row">
                <label className="multi-store-form-field">
                  <span>CEP</span>
                  <input
                    type="text"
                    value={editingStore.zipCode || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, zipCode: e.target.value })}
                    placeholder="00000-000"
                  />
                </label>

                <label className="multi-store-form-field span-2">
                  <span>Logradouro</span>
                  <input
                    type="text"
                    value={editingStore.street || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, street: e.target.value })}
                    placeholder="Rua, Av, Praça..."
                  />
                </label>

                <label className="multi-store-form-field" style={{ maxWidth: 100 }}>
                  <span>Número</span>
                  <input
                    type="text"
                    value={editingStore.number || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, number: e.target.value })}
                    placeholder="123"
                  />
                </label>
              </div>

              <div className="multi-store-form-row">
                <label className="multi-store-form-field">
                  <span>Bairro</span>
                  <input
                    type="text"
                    value={editingStore.neighborhood || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, neighborhood: e.target.value })}
                  />
                </label>

                <label className="multi-store-form-field">
                  <span>Cidade</span>
                  <input
                    type="text"
                    value={editingStore.city || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, city: e.target.value })}
                  />
                </label>

                <label className="multi-store-form-field" style={{ maxWidth: 80 }}>
                  <span>UF</span>
                  <input
                    type="text"
                    value={editingStore.state || 'SP'}
                    onChange={(e) => setEditingStore({ ...editingStore, state: e.target.value.toUpperCase() })}
                    maxLength={2}
                  />
                </label>

                <label className="multi-store-form-field">
                  <span>Cód. IBGE Município</span>
                  <input
                    type="text"
                    value={editingStore.ibgeCityCode || ''}
                    onChange={(e) => setEditingStore({ ...editingStore, ibgeCityCode: e.target.value })}
                    placeholder="Ex: 3550308"
                  />
                </label>
              </div>

              <div className="multi-store-checkbox-group">
                <label className="multi-store-checkbox">
                  <input
                    type="checkbox"
                    checked={editingStore.isMatrix ?? false}
                    onChange={(e) => setEditingStore({ ...editingStore, isMatrix: e.target.checked })}
                  />
                  <span>Definir esta unidade como Loja Matriz da Conta</span>
                </label>

                <label className="multi-store-checkbox">
                  <input
                    type="checkbox"
                    checked={editingStore.active ?? true}
                    onChange={(e) => setEditingStore({ ...editingStore, active: e.target.checked })}
                  />
                  <span>Loja Ativa (Habilitada para vendas e operações)</span>
                </label>
              </div>
            </div>

            <div className="multi-store-modal__footer">
              <button type="button" className="multi-store-btn-secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="multi-store-btn-primary" onClick={handleSaveStore}>
                Salvar Loja
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
