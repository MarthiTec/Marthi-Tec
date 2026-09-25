import { useState, type FormEvent } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState } from '../../data/adminStore';
import { listSellers } from '../../data/erpRegistry';
import {
  createWorkOrder,
  getActiveOperation,
  PRIORITY_LABEL,
  TECHNICIANS_LIST,
  type WorkOrder,
  type WorkOrderPriority,
} from '../../data/osStore';
import { useStoreCustomization } from '../../data/storeSegment';
import { OsCreatedShareModal } from './OsCreatedShareModal';

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

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<WorkOrder | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  if (shareOpen && createdOrder) {
    return (
      <OsCreatedShareModal
        open={shareOpen}
        order={createdOrder}
        authorName={technician}
        onClose={() => {
          setShareOpen(false);
          onCreated(createdOrder);
          onClose();
        }}
        onContinueToOrder={(order) => {
          setShareOpen(false);
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
      });

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
            onClick={onClose}
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
              Equipamento & Estado de Entrada
            </legend>
            <div className="os-form-grid os-form-grid--3">
              <label>
                <span>{customization.showImei ? 'Equipamento / Aparelho *' : 'Item / Descrição do Serviço *'}</span>
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder={customization.showImei ? 'Ex.: iPhone 15, Notebook Dell Inspiron' : 'Ex.: Ajuste de terno, Conserto de mesa, Buffet evento'}
                  required
                />
              </label>
              <label>
                <span>Marca</span>
                <input
                  value={itemBrand}
                  onChange={(e) => setItemBrand(e.target.value)}
                  placeholder="Ex.: Apple, Samsung, Dell"
                />
              </label>
              <label>
                <span>Modelo</span>
                <input
                  value={itemModel}
                  onChange={(e) => setItemModel(e.target.value)}
                  placeholder="Ex.: A2848, G15 5530"
                />
              </label>
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
              Defeito, Diagnóstico & Observações do Técnico
            </legend>
            <div className="os-form-grid os-form-grid--2">
              <label>
                <span>Defeito reclamado pelo cliente *</span>
                <textarea
                  rows={3}
                  value={defect}
                  onChange={(e) => setDefect(e.target.value)}
                  placeholder="Descreva o problema detalhadamente..."
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

            <div className="os-form-grid os-form-grid--5" style={{ marginTop: 12 }}>
              <label>
                <span>Técnico responsável</span>
                <select
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  className="os-select"
                >
                  {TECHNICIANS_LIST.map((tech) => (
                    <option key={tech.id} value={tech.name}>
                      {tech.name} ({tech.specialty})
                    </option>
                  ))}
                </select>
                {selectedTechInfo ? (
                  <div className="os-tech-badge" style={{ marginTop: 6 }}>
                    <img
                      src={selectedTechInfo.avatarUrl}
                      alt={selectedTechInfo.name}
                      className="os-tech-badge__avatar"
                    />
                    <div>
                      <strong>{selectedTechInfo.name}</strong>
                      <small>{selectedTechInfo.role}</small>
                    </div>
                  </div>
                ) : null}
              </label>

              <label>
                <span>Vendedor / Atendente</span>
                <select
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  className="os-select"
                >
                  <option value="">Sem vendedor vinculado</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

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
                <span style={{ whiteSpace: 'nowrap' }}>Peças estimadas (R$)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={parts || ''}
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
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary os-modal__submit-btn"
              disabled={busy}
            >
              {busy ? 'Abrindo OS…' : 'Abrir Ordem de Serviço'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
