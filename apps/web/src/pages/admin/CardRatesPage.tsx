import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import './cardRatesPage.css';
import {useStoreCustomization,saveStoreCustomization} from '../../data/storeSegment';
import {commercialRequest} from '../../services/commercialApi';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  type CardBrand,
  type CardBrandInstallment,
  type CardMachine,
  DEFAULT_CARD_BRANDS,
  DEFAULT_CARD_MACHINES,
  listCardMachines,
  saveAllCardMachines,
  CARD_RATES_CHANGED_EVENT,
  hydrateCardMachinesFromApi,
} from '../../data/cardRatesStore';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export function CardRatesPage() {
  const customization = useStoreCustomization();
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [enabled,setEnabled] = useState(false);
  useEffect(()=>setEnabled(customization.showCardRates),[customization.showCardRates]);
  const { confirm, dialog } = useConfirmDialog();
  const [machines, setMachines] = useState<CardMachine[]>(() => listCardMachines());
  const [selectedMachineId, setSelectedMachineId] = useState<string>(() => {
    const list = listCardMachines();
    const def = list.find((m) => m.isDefaultTotem) ?? list[0];
    return def?.id ?? 'MACH-DEFAULT-01';
  });
  const [selectedBrandId, setSelectedBrandId] = useState<string>('master');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [simGross, setSimGross] = useState<number>(1000);
  const [simParcels, setSimParcels] = useState<number>(12);

  useEffect(() => {
    let active=true;
    const drafts=()=>listCardMachines().map(machine=>({...machine,brands:machine.brands.map(brand=>({...brand,installments:[...Array.from({length:18},(_,i)=>brand.installments.find(row=>row.installment===i+1) || {installment:i+1,rate:0}),...brand.installments.filter(row=>row.installment>18)]}))}));
    const refresh=()=>{if(active)setMachines(drafts());};
    const reload=()=>{setMachines([]);setLoaded(false);setError('');setSaveSuccess(false);void hydrateCardMachinesFromApi().then(refresh).catch(err=>{if(active)setError(err instanceof Error ? err.message : 'Falha ao consultar taxas.');}).finally(()=>{if(active)setLoaded(true);});};
    reload();window.addEventListener(CARD_RATES_CHANGED_EVENT,refresh);window.addEventListener(STORE_CONTEXT_CHANGED_EVENT,reload);
    return()=>{active=false;window.removeEventListener(CARD_RATES_CHANGED_EVENT,refresh);window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT,reload);};
  }, []);

  const activeMachine = useMemo(() => {
    return machines.find((m) => m.id === selectedMachineId) ?? machines[0] ?? {...DEFAULT_CARD_MACHINES[0], id:'', name:'', model:'', brands:DEFAULT_CARD_BRANDS.map(b=>({...b,debitRate:0,installments:b.installments.map(i=>({...i,rate:0}))}))};
  }, [machines, selectedMachineId]);

  const activeBrand = useMemo(() => {
    return (
      activeMachine.brands.find((b) => b.id === selectedBrandId) ??
      activeMachine.brands[0] ??
      DEFAULT_CARD_BRANDS[0]
    );
  }, [activeMachine, selectedBrandId]);

  const defaultTotemMachine = useMemo(() => {
    return machines.find((m) => m.isDefaultTotem) ?? machines[0];
  }, [machines]);

  const defaultTotemBrand = useMemo(() => {
    return (
      defaultTotemMachine?.brands.find((b) => b.id === defaultTotemMachine.defaultBrandId) ??
      defaultTotemMachine?.brands[0]
    );
  }, [defaultTotemMachine]);

  // Atualiza máquina ativa
  function updateActiveMachine(partial: Partial<CardMachine>) {
    const updated: CardMachine = {
      ...activeMachine,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    setMachines(current=>current.some(m=>m.id===updated.id) ? current.map(m=>m.id===updated.id ? updated : m) : [...current,{...updated,id:crypto.randomUUID()}]);
    setSaveSuccess(false);
  }

  // Atualiza bandeira ativa na máquina ativa
  function updateActiveBrand(partial: Partial<CardBrand>) {
    const nextBrands = activeMachine.brands.map((b) => {
      if (b.id === activeBrand.id) {
        return { ...b, ...partial };
      }
      return b;
    });
    updateActiveMachine({ brands: nextBrands });
  }

  // Atualiza taxa de uma parcela específica
  function updateInstallmentRate(installment: number, newRate: number) {
    const nextInstallments = activeBrand.installments.map((inst) => {
      if (inst.installment === installment) {
        return { ...inst, rate: Math.max(0, Number(newRate) || 0) };
      }
      return inst;
    });
    updateActiveBrand({ installments: nextInstallments });
  }

  // Adiciona próxima parcela (ex: 13x, 14x, ... até 24x)
  function addInstallment() {
    const maxInst = activeBrand.installments.reduce((max, it) => Math.max(max, it.installment), 0);
    if (maxInst >= 36) return;
    const nextNum = maxInst + 1;
    const nextRate = 0;
    const nextList: CardBrandInstallment[] = [
      ...activeBrand.installments,
      { installment: nextNum, rate: nextRate },
    ];
    updateActiveBrand({ installments: nextList });
  }

  // Remove última parcela adicionada
  function removeInstallment(installment: number) {
    if (activeBrand.installments.length <= 1) return;
    const nextList = activeBrand.installments.filter((it) => it.installment !== installment);
    updateActiveBrand({ installments: nextList });
  }

  // Cria nova maquininha
  function handleCreateMachine() {
    const id = `MACH-${Date.now().toString(36).toUpperCase()}`;
    const newMachine: CardMachine = {
      id,
      name: `Maquininha ${machines.length + 1}`,
      model: 'Smart POS',
      isDefaultTotem: false,
      defaultBrandId: 'master',
      brands: DEFAULT_CARD_BRANDS.map(b=>({...b,debitRate:0,installments:b.installments.map(i=>({...i,rate:0}))})),
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMachines([...machines,newMachine]);
    setSelectedMachineId(id);
    setSaveSuccess(false);
  }

  // Exclui maquininha
  async function handleDeleteMachine(machine: CardMachine) {
    if (machines.length <= 1) {
      alert('Não é possível excluir a única maquininha cadastrada.');
      return;
    }
    const ok = await confirm({
      title: 'Excluir Maquininha',
      message: `Tem certeza que deseja excluir a maquininha "${machine.name}"?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const updated = machines.filter(m=>m.id!==machine.id);
    setMachines(updated);
    setSelectedMachineId(updated[0].id);
    setSaveSuccess(false);
  }

  // Define maquininha ativa como padrão do Totem
  function handleSetAsTotemDefault() {
    const next = machines.map((m) => ({
      ...m,
      isDefaultTotem: m.id === activeMachine.id,
    }));
    setMachines(next);
    setSaveSuccess(false);
  }

  // Adiciona nova bandeira personalizada
  function handleAddCustomBrand() {
    const name = window.prompt('Nome da nova bandeira (ex: Banricard, Alelo, VR):');
    if (!name?.trim()) return;
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (activeMachine.brands.some((b) => b.id === id)) {
      alert('Já existe uma bandeira com este identificador.');
      return;
    }
    const newBrand: CardBrand = {
      id,
      name: name.trim(),
      debitRate: 0,
      active: true,
      installments: Array.from({ length: 12 }, (_, i) => ({
        installment: i + 1,
        rate: 0,
      })),
    };
    updateActiveMachine({
      brands: [...activeMachine.brands, newBrand],
    });
    setSelectedBrandId(id);
    setSaveSuccess(false);
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaveSuccess(false);
    try {
      await saveAllCardMachines(machines);
      const settings = {...customization, showCardRates:enabled};
      await commercialRequest('/segment','PUT',settings);
      saveStoreCustomization(settings);
      setSaveSuccess(true);
    } catch(err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }

  // Simulação de cálculo no financeiro / totem
  const simTotemCalc = useMemo(() => {
    const rateItem = activeBrand.installments.find((it) => it.installment === simParcels);
    const rate = simParcels === 0 ? activeBrand.debitRate : (rateItem?.rate ?? 0);
    const feeMultiplier = 1 + rate / 100;
    const grossAdjusted = simGross * feeMultiplier;
    const parcelAmount = simParcels > 0 ? grossAdjusted / simParcels : grossAdjusted;
    const cardFeeAmount = (simGross * rate) / 100;
    const netStoreAmount = simGross - cardFeeAmount;

    return {
      rate,
      parcelAmount,
      totalCustomer: grossAdjusted,
      feeAmount: cardFeeAmount,
      netStore: netStoreAmount,
    };
  }, [activeBrand, simGross, simParcels]);

  return (
    <div className="admin-page card-rates-page" style={{ paddingBottom: 60 }}>
      {dialog}

      <div className="admin-page__head" style={{ marginBottom: 18 }}>
        <div>
          <span className="admin-page__kicker">Vendas & Financeiro</span>
          <h1 className="admin-page__title">Taxas de Cartão & Maquininhas</h1>
          <p className="empty" style={{ margin: '4px 0 0', maxWidth: 840 }}>
            Cadastre as taxas de cartão cobradas por cada maquininha e bandeira (Master, Visa, Elo, etc.),
            especificando a taxa para cada número de parcelas (1x, 2x, até 12x ou mais). O Totem respeita a
            bandeira padrão configurada aqui para todos os produtos automaticamente, e o Financeiro utiliza
            para conciliação líquida.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {saveSuccess ? (
            <span
              style={{
                background: 'rgba(45, 212, 191, 0.15)',
                color: 'var(--accent, #2dd4bf)',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid rgba(45, 212, 191, 0.3)',
              }}
            >
              ✓ Configuração salva
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!loaded || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Salvando…' : 'Salvar Taxas'}
          </button>
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={handleCreateMachine}
            title="Adicionar mais uma maquininha POS para a loja"
          >
            + Nova Maquininha
          </button>
          <Link to="/painel/totem/produtos" className="btn btn--ghost btn--sm">
            Ver Catálogo Totem
          </Link>
        </div>
      </div>

      {error ? <p role="alert" className="qty-low">{error}</p> : null}
      <article className="admin-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0, cursor: 'pointer', fontWeight: 600 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Usar taxas de cartão nesta loja</span>
          </label>
          <button
            className="btn btn--primary btn--sm"
            type="button"
            disabled={!loaded || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
        <p className="empty" style={{ margin: '8px 0 0', fontSize: '0.84rem' }}>
          Recurso opcional do ramo. Oficinas iniciam com o recurso ativo. As taxas são definidas por cada loja.
        </p>
      </article>
      <fieldset disabled={!enabled || !loaded || saving} className="card-rates-fields">
      {/* Banner de Referência para o Totem */}
      <article
        className="admin-card"
        style={{
          borderLeft: '4px solid var(--accent, #2dd4bf)',
          marginBottom: 20,
          background: 'var(--card-2, #1c2430)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#2dd4bf',
                  boxShadow: '0 0 8px #2dd4bf',
                }}
              />
              <strong style={{ fontSize: '0.98rem' }}>Referência Ativa para o Totem</strong>
            </div>
            <p className="empty" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              Maquininha Padrão:{' '}
              <strong style={{ color: 'var(--ink, #fff)' }}>{defaultTotemMachine?.name}</strong> ·
              Bandeira de Cálculo:{' '}
              <strong style={{ color: 'var(--accent, #2dd4bf)' }}>{defaultTotemBrand?.name}</strong>{' '}
              (Taxa 12x:{' '}
              <strong>
                {defaultTotemBrand?.installments.find((it) => it.installment === 12)?.rate ?? 0}%
              </strong>
              )
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--mute, #94a3b8)' }}>
              Aplicado a 100% dos produtos do Totem
            </span>
          </div>
        </div>
      </article>

      {/* Seletor de Maquininhas */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {machines.map((machine) => {
          const isSelected = machine.id === activeMachine.id;
          return (
            <button
              key={machine.id}
              type="button"
              className={`btn ${isSelected ? 'btn--primary' : 'btn--outline'}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 8,
                padding: '8px 14px',
              }}
              onClick={() => {
                setSelectedMachineId(machine.id);
                setSelectedBrandId(machine.defaultBrandId || machine.brands[0]?.id || 'master');
              }}
            >
              <span>{machine.name}</span>
              {machine.isDefaultTotem ? (
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: isSelected ? 'rgba(0,0,0,0.25)' : 'rgba(45, 212, 191, 0.2)',
                    color: isSelected ? '#fff' : 'var(--accent, #2dd4bf)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: 700,
                  }}
                >
                  TOTEM
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Detalhes da Maquininha Selecionada */}
      <article className="admin-card" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: '1px solid var(--line, rgba(148, 163, 184, 0.2))',
          }}
        >
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeMachine.name}
              {activeMachine.isDefaultTotem ? (
                <span
                  style={{
                    fontSize: '0.75rem',
                    background: 'rgba(45, 212, 191, 0.2)',
                    color: 'var(--accent, #2dd4bf)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  Padrão do Totem
                </span>
              ) : null}
            </h3>
            <p className="empty" style={{ margin: '3px 0 0', fontSize: '0.82rem' }}>
              Identificador: {activeMachine.id} · Modelo: {activeMachine.model || 'Smart POS'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!activeMachine.isDefaultTotem ? (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={handleSetAsTotemDefault}
                title="Definir esta maquininha como a referência para cálculo de parcelas do Totem"
              >
                ★ Definir como Padrão do Totem
              </button>
            ) : null}
            {machines.length > 1 ? (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => handleDeleteMachine(activeMachine)}
                title="Remover esta maquininha"
              >
                Excluir Maquininha
              </button>
            ) : null}
          </div>
        </div>

        {/* Configurações básicas da Maquininha */}
        <div className="card-rates-machine-fields">
          <label>
            <span className="admin-field-label">Nome da Maquininha / Ponto</span>
            <input
              type="text"
              value={activeMachine.name}
              onChange={(e) => updateActiveMachine({ name: e.target.value })}
              placeholder="Ex: Maquininha Balcão 1 (Stone)"
            />
          </label>

          <label>
            <span className="admin-field-label">Modelo / Adquirente</span>
            <input
              type="text"
              value={activeMachine.model ?? ''}
              onChange={(e) => updateActiveMachine({ model: e.target.value })}
              placeholder="Ex: PagBank Pro 2 / Stone P2"
            />
          </label>

          <AdminPicker
            label="Bandeira Referência p/ Totem"
            value={activeMachine.defaultBrandId}
            options={activeMachine.brands
              .filter((b) => b.active)
              .map((b) => ({ value: b.id, label: b.name }))}
            onChange={(val) => updateActiveMachine({ defaultBrandId: val })}
          />
        </div>

        {/* Abas das Bandeiras */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: '0.9rem' }}>Bandeiras Cadastradas nesta Maquininha:</strong>
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              onClick={handleAddCustomBrand}
              title="Cadastrar bandeira personalizada"
            >
              + Adicionar Outra Bandeira
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 4,
            }}
          >
            {activeMachine.brands.map((brand) => {
              const isBrandActive = brand.id === activeBrand.id;
              const isTotemRef = activeMachine.defaultBrandId === brand.id;

              return (
                <button
                  key={brand.id}
                  type="button"
                  className={`btn btn--sm ${isBrandActive ? 'btn--primary' : 'btn--outline'}`}
                  style={{
                    borderRadius: 6,
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => setSelectedBrandId(brand.id)}
                >
                  <span>{brand.name}</span>
                  {isTotemRef ? (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        background: isBrandActive ? 'rgba(0,0,0,0.3)' : 'rgba(45, 212, 191, 0.2)',
                        color: isBrandActive ? '#fff' : 'var(--accent, #2dd4bf)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontWeight: 700,
                      }}
                    >
                      TOTEM
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabela de Parcelamento da Bandeira Ativa */}
        <div
          style={{
            background: 'var(--card-2, #1c2430)',
            borderRadius: 8,
            padding: 16,
            border: '1px solid var(--line, rgba(148, 163, 184, 0.2))',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--ink, #fff)' }}>
                Taxas da Bandeira: {activeBrand.name}
              </h4>
              <p className="empty" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>
                Edite a taxa em percentual (%) para cada número de parcelas desejado.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  margin: 0,
                  fontSize: '0.85rem',
                }}
              >
                <span>Taxa no Débito (%):</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={activeBrand.debitRate}
                  style={{ width: 85 }}
                  onChange={(e) => updateActiveBrand({ debitRate: Number(e.target.value) })}
                />
              </label>

              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={addInstallment}
                title="Adicionar mais uma parcela à tabela (ex: 13x, 14x, ... até 24x)"
              >
                + Adicionar Parcela
              </button>
            </div>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Parcela</th>
                  <th style={{ width: 160 }}>Taxa da Operadora (%)</th>
                  <th>Simulação Totem (R$ 1.000)</th>
                  <th>Conciliação Financeira (R$ 1.000)</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {activeBrand.installments.map((item) => {
                  const samplePrice = 1000;
                  const feeMultiplier = 1 + item.rate / 100;
                  const totalClient = samplePrice * feeMultiplier;
                  const parcelVal = totalClient / item.installment;
                  const feeAmount = (samplePrice * item.rate) / 100;
                  const netStore = samplePrice - feeAmount;

                  return (
                    <tr key={item.installment}>
                      <td>
                        <strong style={{ fontSize: '0.92rem' }}>{item.installment}x</strong>
                        {item.installment === 12 && activeMachine.defaultBrandId === activeBrand.id ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: '0.72rem',
                              background: 'rgba(45, 212, 191, 0.2)',
                              color: 'var(--accent, #2dd4bf)',
                              padding: '2px 5px',
                              borderRadius: 4,
                              fontWeight: 700,
                            }}
                          >
                            Padrão Totem
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            value={item.rate}
                            style={{ width: 95, fontWeight: 700 }}
                            onChange={(e) =>
                              updateInstallmentRate(item.installment, Number(e.target.value))
                            }
                          />
                          <span style={{ fontSize: '0.85rem', color: 'var(--mute, #94a3b8)' }}>%</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.88rem' }}>
                          <strong>
                            {item.installment}x de R${' '}
                            {parcelVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>{' '}
                          <span className="empty" style={{ fontSize: '0.78rem' }}>
                            (Total: R${' '}
                            {totalClient.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>
                          <span style={{ color: '#ef4444' }}>
                            -R${' '}
                            {feeAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            taxa
                          </span>{' '}
                          ·{' '}
                          <span style={{ color: '#22c55e', fontWeight: 600 }}>
                            Líquido R${' '}
                            {netStore.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {item.installment > 1 ? (
                          <button
                            type="button"
                            className="btn btn--danger btn--xs"
                            title={`Remover parcela ${item.installment}x`}
                            onClick={() => removeInstallment(item.installment)}
                          >
                            ×
                          </button>
                        ) : (
                          <span className="empty" style={{ fontSize: '0.78rem' }}>
                            Mín.
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </article>

      {/* Simulador Interativo para Conferência do Lojista */}
      <article className="admin-card">
        <h3 style={{ margin: '0 0 6px' }}>Simulador de Venda & Conciliação</h3>
        <p className="empty" style={{ margin: '0 0 16px', fontSize: '0.82rem' }}>
          Teste qualquer valor para simular como a parcela aparece ao cliente no Totem e qual será o valor
          líquido creditado na conta da loja pelo Financeiro.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <label>
            <span className="admin-field-label">Valor da Venda (R$)</span>
            <input
              type="number"
              min={1}
              step="10"
              value={simGross}
              onChange={(e) => setSimGross(Math.max(1, Number(e.target.value) || 0))}
            />
          </label>

          <AdminPicker
            label="Bandeira Simulada"
            value={activeBrand.id}
            options={activeMachine.brands.map((b) => ({ value: b.id, label: b.name }))}
            onChange={(val) => setSelectedBrandId(val)}
          />

          <AdminPicker
            label="Parcelamento"
            value={String(simParcels)}
            options={[
              { value: '0', label: `Débito (${activeBrand.debitRate}%)` },
              ...activeBrand.installments.map((it) => ({
                value: String(it.installment),
                label: `${it.installment}x (${it.rate}%)`,
              })),
            ]}
            onChange={(val) => setSimParcels(Number(val))}
          />
        </div>

        {/* Painel de Resultados do Simulador */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            background: 'var(--card-2, #1c2430)',
            padding: 16,
            borderRadius: 8,
            border: '1px solid var(--line, rgba(148, 163, 184, 0.2))',
          }}
        >
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--mute, #94a3b8)' }}>Taxa Aplicada</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink, #fff)' }}>
              {simTotemCalc.rate.toFixed(2).replace('.', ',')}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--mute, #94a3b8)' }}>
              {simParcels === 0 ? 'Débito à vista' : `Crédito em ${simParcels} parcelas`}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--mute, #94a3b8)' }}>Parcela no Totem</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent, #2dd4bf)' }}>
              {simParcels > 0
                ? `${simParcels}x de R$ ${simTotemCalc.parcelAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `R$ ${simTotemCalc.totalCustomer.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--mute, #94a3b8)' }}>
              Total com juros: R${' '}
              {simTotemCalc.totalCustomer.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--mute, #94a3b8)' }}>
              Taxa da Maquininha (Desconto)
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>
              -R${' '}
              {simTotemCalc.feeAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--mute, #94a3b8)' }}>
              Retido pela adquirente
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--mute, #94a3b8)' }}>
              Líquido a Receber (Financeiro)
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#22c55e' }}>
              R${' '}
              {simTotemCalc.netStore.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--mute, #94a3b8)' }}>
              Crédito real no caixa da loja
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
          {saveSuccess ? (
            <span
              style={{
                background: 'rgba(45, 212, 191, 0.15)',
                color: 'var(--accent, #2dd4bf)',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid rgba(45, 212, 191, 0.3)',
              }}
            >
              ✓ Configuração salva com sucesso
            </span>
          ) : null}
          <button
            className="btn btn--primary"
            type="button"
            disabled={!loaded || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Salvando…' : 'Salvar Alterações'}
          </button>
        </div>
      </article>
      </fieldset>
    </div>
  );
}
