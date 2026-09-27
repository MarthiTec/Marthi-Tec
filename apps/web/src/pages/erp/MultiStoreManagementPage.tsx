import { useEffect, useState } from 'react';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import {
  calculateLicensingSummary,
  deleteStore,
  getActiveStoreId,
  getClientAccount,
  listDiscountRules,
  listStores,
  saveDiscountRules,
  saveStore,
  setActiveStoreId,
  MULTI_STORE_CHANGED_EVENT,
  STORE_CONTEXT_CHANGED_EVENT,
  type ClientAccount,
  type LicensingDiscountRule,
  type Store,
  type StoreTaxRegime,
} from '../../data/multiStoreStore';
import './multiStore.css';

type Tab = 'stores' | 'licensing' | 'rules' | 'isolation';

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
  const [discountRules, setRules] = useState<LicensingDiscountRule[]>(() => listDiscountRules());
  const [licensingSummary, setLicensingSummary] = useState(() => calculateLicensingSummary());

  // Modal Loja
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Partial<Store>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Modal Regra Comercial
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<LicensingDiscountRule>>({});

  useEffect(() => {
    function refresh() {
      setStores(listStores());
      setClientAccount(getClientAccount());
      setActiveStore(getActiveStoreId());
      setRules(listDiscountRules());
      setLicensingSummary(calculateLicensingSummary());
    }

    window.addEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(MULTI_STORE_CHANGED_EVENT, refresh);
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    };
  }, []);

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
      state: 'SP',
      ibgeCityCode: '',
      taxRegime: 'simples_nacional',
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
      code: '',
      name: `${store.name} (Cópia)`,
      tradeName: `${store.tradeName} (Cópia)`,
      cnpj: '',
      isMatrix: false,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function handleDelete(storeId: string) {
    const s = stores.find((it) => it.id === storeId);
    if (!s) return;
    if (s.isMatrix && stores.length > 1) {
      alert('A Loja Matriz não pode ser excluída enquanto houver outras filiais cadastradas.');
      return;
    }
    if (confirmDelete(`Deseja realmente remover a loja "${s.name}" (CNPJ: ${s.cnpj})?`)) {
      deleteStore(storeId);
    }
  }

  function handleSaveStore() {
    if (!editingStore.name?.trim()) {
      setFormError('Informe a Razão Social ou Nome da Loja.');
      return;
    }
    if (!editingStore.cnpj?.trim()) {
      setFormError('Informe o CNPJ da Loja/Filial.');
      return;
    }

    try {
      saveStore({
        ...editingStore,
        name: editingStore.name.trim(),
        cnpj: editingStore.cnpj.trim(),
      });
      setModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar loja.';
      setFormError(msg);
    }
  }

  function handleSaveRule() {
    if (!editingRule.name?.trim()) return;
    const rules = [...discountRules];
    if (editingRule.id) {
      const idx = rules.findIndex((r) => r.id === editingRule.id);
      if (idx >= 0) {
        rules[idx] = { ...rules[idx], ...(editingRule as LicensingDiscountRule) };
      }
    } else {
      rules.push({
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
    saveDiscountRules(rules);
    setRuleModalOpen(false);
  }

  function handleToggleRule(ruleId: string) {
    const next = discountRules.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r));
    saveDiscountRules(next);
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
          className={`multi-store-tab ${activeTab === 'rules' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          <AdminIcon name="ops" />
          Regras de Desconto Progressivo
        </button>
        <button
          type="button"
          className={`multi-store-tab ${activeTab === 'isolation' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('isolation')}
        >
          <AdminIcon name="box" />
          Matriz de Isolamento de Dados
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

          <div className="multi-store-table-container">
            <table className="multi-store-table">
              <thead>
                <tr>
                  <th>Cód</th>
                  <th>Loja / Razão Social</th>
                  <th>CNPJ</th>
                  <th>Inscrição Est.</th>
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
                      <td>{s.stateRegistration || '—'}</td>
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

            <div className="multi-store-table-container">
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

      {/* TAB 3: REGRAS DE DESCONTO */}
      {activeTab === 'rules' && (
        <section className="multi-store-section">
          <div className="multi-store-actions-bar">
            <div>
              <h3>Tabela de Regras de Desconto Progressivo</h3>
              <p className="multi-store-subtext">
                Defina a política comercial para redes com múltiplas lojas. Os descontos são aplicados dinamicamente
                a partir da segunda loja cadastrada.
              </p>
            </div>
            <button
              type="button"
              className="multi-store-btn-primary"
              onClick={() => {
                setEditingRule({
                  name: '',
                  minStores: 2,
                  maxStores: null,
                  discountType: 'percent',
                  discountValue: 15,
                  active: true,
                  notes: '',
                });
                setRuleModalOpen(true);
              }}
            >
              + Nova Faixa de Desconto
            </button>
          </div>

          <div className="multi-store-table-container">
            <table className="multi-store-table">
              <thead>
                <tr>
                  <th>Nome da Regra Comercial</th>
                  <th>Qtd. Mínima</th>
                  <th>Qtd. Máxima</th>
                  <th>Tipo de Desconto</th>
                  <th>Valor / Percentual</th>
                  <th>Status</th>
                  <th>Observações</th>
                  <th style={{ width: 100 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {discountRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.name}</strong>
                    </td>
                    <td>{rule.minStores} loja(s)</td>
                    <td>{rule.maxStores ? `${rule.maxStores} lojas` : 'Sem limite (N+)'}</td>
                    <td>{rule.discountType === 'percent' ? 'Percentual (%)' : 'Valor Fixo (R$)'}</td>
                    <td>
                      <strong style={{ color: '#2563eb' }}>
                        {rule.discountType === 'percent'
                          ? `${rule.discountValue}%`
                          : `R$ ${rule.discountValue.toFixed(2).replace('.', ',')}`}
                      </strong>
                    </td>
                    <td>
                      <span className={`multi-store-status-pill ${rule.active ? 'is-active' : 'is-inactive'}`}>
                        {rule.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>{rule.notes || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="multi-store-btn-switch"
                        onClick={() => handleToggleRule(rule.id)}
                      >
                        {rule.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 4: ISOLAMENTO DE DADOS */}
      {activeTab === 'isolation' && (
        <section className="multi-store-section">
          <div className="multi-store-card">
            <div className="multi-store-card__header">
              <h3>Garantia de Isolamento de Dados por Loja (Multi-Tenant Seguro)</h3>
              <p>
                Cada módulo do sistema Marthi opera estritamente sob o escopo da <code>store_id</code> selecionada.
                Dados nunca vazam entre filiais.
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
                <strong>Caixa & PDV</strong>
                <p>
                  Terminais de venda, abertura e fechamento de sessões, sangrias, suprimentos e vendas (inclusive Venda
                  Avulsa) pertencem exclusivamente ao caixa e CNPJ da loja atual.
                </p>
              </div>

              <div className="multi-store-isolation-item">
                <span className="multi-store-isolation-icon">🛠️</span>
                <strong>Ordens de Serviço (OS)</strong>
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
              </div>

              <div className="multi-store-form-row">
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

      {/* MODAL REGRA COMERCIAL */}
      {ruleModalOpen && (
        <div className="multi-store-modal-backdrop" role="dialog" aria-modal="true">
          <div className="multi-store-modal" style={{ maxWidth: 540 }}>
            <div className="multi-store-modal__header">
              <h2>Nova Regra de Desconto Multi-Loja</h2>
              <button
                type="button"
                className="multi-store-modal__close"
                onClick={() => setRuleModalOpen(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="multi-store-modal__body">
              <label className="multi-store-form-field">
                <span>Nome da Regra Comercial</span>
                <input
                  type="text"
                  value={editingRule.name || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="Ex: 2 Lojas (15% off a partir da 2ª loja)"
                />
              </label>

              <div className="multi-store-form-row">
                <label className="multi-store-form-field">
                  <span>Qtd. Mínima de Lojas</span>
                  <input
                    type="number"
                    min={1}
                    value={editingRule.minStores ?? 2}
                    onChange={(e) => setEditingRule({ ...editingRule, minStores: Number(e.target.value) })}
                  />
                </label>

                <label className="multi-store-form-field">
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

              <div className="multi-store-form-row">
                <div className="multi-store-form-field">
                  <AdminPicker
                    label="Tipo de Desconto"
                    value={editingRule.discountType || 'percent'}
                    options={[
                      { value: 'percent', label: 'Percentual (%)' },
                      { value: 'fixed', label: 'Valor Fixo (R$)' },
                    ]}
                    onChange={(val) => setEditingRule({ ...editingRule, discountType: val as 'percent' | 'fixed' })}
                  />
                </div>

                <label className="multi-store-form-field">
                  <span>Valor do Desconto</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editingRule.discountValue ?? 15}
                    onChange={(e) => setEditingRule({ ...editingRule, discountValue: Number(e.target.value) })}
                  />
                </label>
              </div>

              <label className="multi-store-form-field">
                <span>Observação Comercial</span>
                <input
                  type="text"
                  value={editingRule.notes || ''}
                  onChange={(e) => setEditingRule({ ...editingRule, notes: e.target.value })}
                  placeholder="Ex: Aplicável a redes regionais"
                />
              </label>
            </div>

            <div className="multi-store-modal__footer">
              <button type="button" className="multi-store-btn-secondary" onClick={() => setRuleModalOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="multi-store-btn-primary" onClick={handleSaveRule}>
                Salvar Regra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
