import { useState, useEffect, useRef, type FormEvent } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { QuickCreateCustomer } from '../../components/QuickCreate';
import { QuickAddButton } from '../../components/QuickModal';
import { getAdminState } from '../../data/adminStore';
import { listSellers } from '../../data/erpRegistry';
import {
  createWorkOrder,
  getActiveOperation,
  PRIORITY_LABEL,
  TECHNICIANS_LIST,
  type WorkOrder,
  type WorkOrderLine,
  type WorkOrderPriority,
} from '../../data/osStore';
import { useStoreCustomization } from '../../data/storeSegment';
import { OsCreatedShareModal } from './OsCreatedShareModal';
import { refreshStockFinance } from '../../data/workshopLedger';
import type { StockPartChoice } from '../../services/repairPartsApi';
import { OsDeviceRepairSelector, type OsRepairSelectionResult } from './OsDeviceRepairSelector';
import { OsRepairPartsPicker } from './OsRepairPartsPicker';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (order: WorkOrder) => void;
};

export function OsNewModal({ open, onClose, onCreated }: Props) {
  const customization = useStoreCustomization();
  const customers = getAdminState().customers;
  const activeOp = getActiveOperation();
  const sellers = listSellers(true);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);

  const [itemName, setItemName] = useState('');
  const [itemBrand, setItemBrand] = useState('');
  const [itemModel, setItemModel] = useState('');
  const [itemColor, setItemColor] = useState('');
  const [itemRef, setItemRef] = useState('');
  const [devicePassword, setDevicePassword] = useState('');
  const [accessories, setAccessories] = useState('');
  const [conditionOnEntry, setConditionOnEntry] = useState('');

  const [defect, setDefect] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [techNotes, setTechNotes] = useState('');

  const [technician, setTechnician] = useState(TECHNICIANS_LIST[0]?.name ?? '');
  const [sellerId, setSellerId] = useState('');
  const [priority, setPriority] = useState<WorkOrderPriority>('normal');
  const [estimatedReadyAt, setEstimatedReadyAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [labor, setLabor] = useState(0);
  const [parts, setParts] = useState(0);
  const [selectedLines, setSelectedLines] = useState<WorkOrderLine[]>([]);
  const [stockParts, setStockParts] = useState<StockPartChoice[]>([]);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [resetSignal, setResetSignal] = useState(0);
  const lastAutoDefectRef = useRef('');

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<WorkOrder | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  function resetForm() {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerDocument('');
    setCustomerEmail('');

    setItemName('');
    setItemBrand('');
    setItemModel('');
    setItemColor('');
    setItemRef('');
    setDevicePassword('');
    setAccessories('');
    setConditionOnEntry('');

    setDefect('');
    setDiagnosis('');
    setNotes('');
    setTechNotes('');

    setTechnician(TECHNICIANS_LIST[0]?.name ?? '');
    setSellerId('');
    setPriority('normal');
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setEstimatedReadyAt(d.toISOString().split('T')[0]);
    setLabor(0);
    setParts(0);
    setSelectedLines([]);
    setStockParts([]);
    setQuoteNotes('');
    lastAutoDefectRef.current = '';
    setResetSignal((s) => s + 1);

    setError('');
    setBusy(false);
  }

  function handleRepairSelectionChange(res: OsRepairSelectionResult) {
    setSelectedLines(res.lines);
    setQuoteNotes(res.quoteNotes);
    setLabor(res.totalPrice);
    setDefect((prev) => {
      const trimmed = prev.trim();
      if (!trimmed || trimmed === lastAutoDefectRef.current) {
        lastAutoDefectRef.current = res.summaryText;
        return res.summaryText;
      }
      lastAutoDefectRef.current = res.summaryText;
      return prev;
    });
  }

  // Limpa os campos sempre que o modal for reaberto
  useEffect(() => {
    if (open) {
      resetForm();
      setCreatedOrder(null);
      setShareOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        const form = document.querySelector('.os-modal__form') as HTMLFormElement | null;
        form?.requestSubmit();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleCloseModal() {
    resetForm();
    onClose();
  }

  if (shareOpen && createdOrder) {
    return (
      <OsCreatedShareModal
        open={shareOpen}
        order={createdOrder}
        authorName={createdOrder.technician || technician}
        onClose={() => {
          setShareOpen(false);
          setCreatedOrder(null);
          resetForm();
          onCreated(createdOrder);
          onClose();
        }}
        onContinueToOrder={(order) => {
          setShareOpen(false);
          setCreatedOrder(null);
          resetForm();
          onCreated(order);
          onClose();
        }}
      />
    );
  }

  if (!open) return null;

  function pickCustomer(id: string) {
    const c = customers.find((item) => item.id === id);
    if (!c) return;
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    if (c.document) setCustomerDocument(c.document);
    if (c.email) setCustomerEmail(c.email);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!customerName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }
    if (!itemName.trim()) {
      setError('Informe o equipamento ou modelo.');
      return;
    }
    if (!defect.trim()) {
      setError('Descreva o defeito relatado.');
      return;
    }

    setError('');
    setBusy(true);

    try {
      const created = await createWorkOrder({
        operationId: activeOp.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerDocument: customerDocument.trim(),
        customerEmail: customerEmail.trim(),
        itemName: itemName.trim(),
        itemBrand: itemBrand.trim(),
        itemModel: itemModel.trim(),
        itemColor: itemColor.trim(),
        itemRef: itemRef.trim(),
        devicePassword: devicePassword.trim(),
        accessories: accessories.trim(),
        conditionOnEntry: conditionOnEntry.trim(),
        defect: defect.trim(),
        diagnosis: diagnosis.trim(),
        notes: notes.trim(),
        techNotes: techNotes.trim(),
        estimatedReadyAt,
        technician,
        sellerId,
        priority,
        labor: Number(labor) || 0,
        parts: Number(parts) || 0,
        lines: selectedLines,
        quoteStatus: selectedLines.length > 0 ? 'approved' : 'none',
        quoteNotes: quoteNotes.trim(),
        stockParts,
      });
      // As peças saíram do estoque no servidor: atualiza o saldo na tela.
      if (stockParts.length) void refreshStockFinance();

      // Limpa todos os campos do formulário imediatamente após gerar a OS
      resetForm();
      setCreatedOrder(created);
      setShareOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir ordem de serviço.');
    } finally {
      setBusy(false);
    }
  }

  const selectedTechInfo = TECHNICIANS_LIST.find((t) => t.name === technician);

  return (
    <div className="os-modal-backdrop" role="dialog" aria-modal="true">
      <div className="os-modal os-modal--large">
        <header className="os-modal__head">
          <div className="os-modal__title-group">
            <span className="os-modal__kicker">
              {activeOp.title} · Abertura Rápida
            </span>
            <h2>Nova Ordem de Serviço</h2>
          </div>
          <button
            type="button"
            className="os-modal__close-btn"
            onClick={handleCloseModal}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>

        {error ? <div className="os-modal__error">{error}</div> : null}

        <form className="os-modal__form" onSubmit={handleSubmit}>
          {/* Seção 1: Cliente */}
          <fieldset className="os-form-section">
            <legend className="os-form-section__legend">
              <span className="os-form-section__num">1</span>
              Dados do Cliente
            </legend>
            <div className="os-form-grid os-form-grid--3">
              <div className="os-form-col-full">
                <AdminPicker
                  label="Buscar cliente cadastrado"
                  value=""
                  placeholder="Selecione para preencher automaticamente…"
                  options={customers.map((c) => ({
                    value: c.id,
                    label: `${c.name} · ${c.phone}`,
                  }))}
                  onChange={pickCustomer}
                />
                <div className="quick-field__actions">
                  <QuickAddButton label="Novo cliente" onClick={() => setQuickCustomerOpen(true)} />
                </div>
                {quickCustomerOpen ? (
                  <QuickCreateCustomer
                    initial={{ name: customerName, phone: customerPhone, document: customerDocument, email: customerEmail }}
                    onClose={() => setQuickCustomerOpen(false)}
                    onCreated={(customer) => {
                      setCustomerName(customer.name);
                      setCustomerPhone(customer.phone);
                      setCustomerDocument(customer.document);
                      setCustomerEmail(customer.email);
                    }}
                  />
                ) : null}
              </div>
              <label>
                <span>Nome completo *</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  required
                />
              </label>
              <label>
                <span>Telefone / WhatsApp</span>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </label>
              <label>
                <span>CPF / CNPJ</span>
                <input
                  value={customerDocument}
                  onChange={(e) => setCustomerDocument(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </label>
              <label className="os-form-col-full">
                <span>E-mail</span>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                />
              </label>
            </div>
          </fieldset>

          {/* Seção 2: Equipamento e Segurança */}
          <fieldset className="os-form-section">
            <legend className="os-form-section__legend">
              <span className="os-form-section__num">2</span>
              Aparelho, Manutenções Tabeladas &amp; Estado de Entrada
            </legend>

            <OsDeviceRepairSelector
              itemName={itemName}
              itemBrand={itemBrand}
              itemModel={itemModel}
              resetSignal={resetSignal}
              onSelectDevice={(dev) => {
                setItemName(dev.itemName);
                setItemBrand(dev.itemBrand);
                setItemModel(dev.itemModel);
              }}
              onSelectionChange={handleRepairSelectionChange}
            />
            <OsRepairPartsPicker brand={itemBrand} model={itemModel} serviceLines={selectedLines} resetSignal={resetSignal} onChange={setStockParts} />

            <div className="os-form-grid os-form-grid--3" style={{ marginTop: 12 }}>
              <label>
                <span>Cor</span>
                <input
                  value={itemColor}
                  onChange={(e) => setItemColor(e.target.value)}
                  placeholder="Ex.: Preto, Titânio Azul"
                />
              </label>
              {customization.showImei ? (
                <label>
                  <span>Nº de Série / IMEI</span>
                  <input
                    value={itemRef}
                    onChange={(e) => setItemRef(e.target.value)}
                    placeholder="IMEI ou Serial Number"
                  />
                </label>
              ) : null}
              {customization.showDevicePassword ? (
                <label>
                  <span>Senha / PIN do Aparelho</span>
                  <input
                    value={devicePassword}
                    onChange={(e) => setDevicePassword(e.target.value)}
                    placeholder="Senha para testes da bancada"
                  />
                </label>
              ) : null}
              <label className="os-form-col-full">
                <span>Acessórios deixados</span>
                <input
                  value={accessories}
                  onChange={(e) => setAccessories(e.target.value)}
                  placeholder="Ex.: Capa protetora, fonte original, cabo USB-C, chip SIM"
                />
              </label>
              <label className="os-form-col-full">
                <span>Condições estéticas na entrada</span>
                <input
                  value={conditionOnEntry}
                  onChange={(e) => setConditionOnEntry(e.target.value)}
                  placeholder="Ex.: Marcas de uso na traseira, tela trincada no vértice inferior esquerdo"
                />
              </label>
            </div>
          </fieldset>

          {/* Seção 3: Defeito, Diagnóstico e Notas da Bancada */}
          <fieldset className="os-form-section">
            <legend className="os-form-section__legend">
              <span className="os-form-section__num">3</span>
              Serviço Solicitado, Diagnóstico &amp; Observações do Técnico
            </legend>
            <div className="os-form-grid os-form-grid--2">
              <label>
                <span>
                  {selectedLines.length > 0
                    ? 'Serviços selecionados / Relato adicional do cliente'
                    : 'Serviço solicitado / Defeito reclamado pelo cliente *'}
                </span>
                <textarea
                  rows={3}
                  value={defect}
                  onChange={(e) => setDefect(e.target.value)}
                  placeholder="Preenchido automaticamente ao clicar nos serviços acima, ou descreva aqui..."
                  required
                />
              </label>
              <label>
                <span>Diagnóstico inicial da bancada</span>
                <textarea
                  rows={3}
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Pré-análise técnica, testes rápidos..."
                />
              </label>
              <label>
                <span>Observações do Técnico / Notas da Bancada 🛠️</span>
                <textarea
                  rows={3}
                  value={techNotes}
                  onChange={(e) => setTechNotes(e.target.value)}
                  placeholder="Anotações exclusivas do técnico (medições, componentes suspeitos, testes adicionais)..."
                />
              </label>
              <label>
                <span>Observações internas / Atendimento</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Avisos internos, alinhamentos comerciais..."
                />
              </label>
            </div>
          </fieldset>

          {/* Seção 4: Atribuição, Prioridade e Prazos */}
          <fieldset className="os-form-section">
            <legend className="os-form-section__legend">
              <span className="os-form-section__num">4</span>
              Técnico, Vendedor, Prioridade & Estimativa
            </legend>

            <div className="os-priority-selector">
              <span className="os-priority-selector__label">Prioridade da OS:</span>
              <div className="os-priority-buttons">
                {(['low', 'normal', 'high', 'urgent'] as WorkOrderPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`os-p-btn os-p-btn--${p} ${priority === p ? 'is-active' : ''}`}
                    onClick={() => setPriority(p)}
                  >
                    <span className="os-p-btn__dot" />
                    <strong>{PRIORITY_LABEL[p]}</strong>
                  </button>
                ))}
              </div>
            </div>

            {/* Atribuição: Técnico e Vendedor em 2 colunas proporcionais e equilibradas */}
            <div className="os-form-grid os-form-grid--2" style={{ marginTop: 12 }}>
              <div style={{ minWidth: 0 }}>
                <AdminPicker
                  label="Técnico responsável"
                  value={technician}
                  options={[
                    { value: '', label: 'Sem técnico atribuído' },
                    ...TECHNICIANS_LIST.map((tech) => ({
                      value: tech.name,
                      label: `${tech.name}${tech.specialty ? ` (${tech.specialty})` : ''}`,
                    })),
                  ]}
                  onChange={setTechnician}
                />
                {selectedTechInfo ? (
                  <div className="os-tech-badge" style={{ marginTop: 6 }}>
                    {selectedTechInfo.avatarUrl ? (
                      <img
                        src={selectedTechInfo.avatarUrl}
                        alt={selectedTechInfo.name}
                        className="os-tech-badge__avatar"
                      />
                    ) : (
                      <div
                        className="os-tech-badge__avatar"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#2563eb',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                        }}
                      >
                        {selectedTechInfo.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <strong>{selectedTechInfo.name}</strong>
                      <small>{selectedTechInfo.role}</small>
                    </div>
                  </div>
                ) : null}
              </div>

              <div style={{ minWidth: 0 }}>
                <AdminPicker
                  label="Vendedor / Atendente"
                  value={sellerId}
                  options={[
                    { value: '', label: 'Sem vendedor vinculado' },
                    ...sellers.map((s) => ({
                      value: s.id,
                      label: s.name,
                    })),
                  ]}
                  onChange={setSellerId}
                />
              </div>
            </div>

            {/* Prazos e Estimativas em 3 colunas */}
            <div className="os-form-grid os-form-grid--3" style={{ marginTop: 12 }}>
              <label>
                <span style={{ whiteSpace: 'nowrap' }}>Previsão de conclusão</span>
                <input
                  type="date"
                  value={estimatedReadyAt}
                  onChange={(e) => setEstimatedReadyAt(e.target.value)}
                />
              </label>

              <label>
                <span style={{ whiteSpace: 'nowrap' }}>Mão de obra (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={labor || ''}
                  onChange={(e) => setLabor(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                />
              </label>

              <label>
                <span style={{ whiteSpace: 'nowrap' }}>{stockParts.length ? 'Peças do estoque (R$)' : 'Peças estimadas (R$)'}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={stockParts.length ? stockParts.reduce((sum, part) => sum + part.unitPrice * part.qty, 0) || '' : parts || ''}
                  readOnly={stockParts.length > 0}
                  title={stockParts.length ? 'Soma das peças cobradas à parte (as incluídas no serviço não somam)' : undefined}
                  onChange={(e) => setParts(parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                />
              </label>
            </div>
          </fieldset>

          <footer className="os-modal__foot">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleCloseModal}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary os-modal__submit-btn"
              disabled={busy}
              title="Salvar Ordem de Serviço [Ctrl+S]"
            >
              <span>{busy ? 'Abrindo OS…' : 'Abrir Ordem de Serviço'}</span>
              <kbd className="os-key-badge">Ctrl+S</kbd>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
