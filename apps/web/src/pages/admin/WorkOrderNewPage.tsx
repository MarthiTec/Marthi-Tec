import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { QuickCreateCustomer } from '../../components/QuickCreate';
import { QuickAddButton } from '../../components/QuickModal';
import { getAdminState } from '../../data/adminStore';
import { listSellers } from '../../data/erpRegistry';
import { getOperatorProfile } from '../../data/operatorProfile';
import {
  createWorkOrder,
  PRIORITY_LABEL,
  type WorkOrder,
  type WorkOrderLine,
  type WorkOrderPriority,
} from '../../data/osStore';
import { useAuth } from '../../contexts/AuthContext';
import { osHref, useOsBase } from '../os/osPaths';
import { OsCreatedShareModal } from '../os/OsCreatedShareModal';
import { refreshStockFinance } from '../../data/workshopLedger';
import type { StockPartChoice } from '../../services/repairPartsApi';
import { OsDeviceRepairSelector, type OsRepairSelectionResult } from '../os/OsDeviceRepairSelector';
import { OsRepairPartsPicker } from '../os/OsRepairPartsPicker';
import '../os/os.css';

const EMPTY = {
  customerName: '',
  customerPhone: '',
  customerDocument: '',
  customerEmail: '',
  itemName: '',
  itemBrand: '',
  itemModel: '',
  itemColor: '',
  itemRef: '',
  devicePassword: '',
  accessories: '',
  conditionOnEntry: '',
  defect: '',
  diagnosis: '',
  notes: '',
  estimatedReadyAt: '',
  technician: '',
  sellerId: '',
  priority: 'normal' as WorkOrderPriority,
  labor: 0,
  parts: 0,
};

export function WorkOrderNewPage() {
  const navigate = useNavigate();
  const osBase = useOsBase();
  const { user } = useAuth();
  const profile = getOperatorProfile(user?.name ?? 'Operador');
  const customers = getAdminState().customers;
  const sellers = listSellers(true);
  const [form, setForm] = useState({ ...EMPTY, technician: profile.displayName });
  const [selectedLines, setSelectedLines] = useState<WorkOrderLine[]>([]);
  const [stockParts, setStockParts] = useState<StockPartChoice[]>([]);
  const [quoteNotes, setQuoteNotes] = useState('');
  const [resetSignal, setResetSignal] = useState(0);
  const lastAutoDefectRef = useRef('');
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<WorkOrder | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);

  function pickCustomer(id: string) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerDocument: customer.document || current.customerDocument,
      customerEmail: customer.email || current.customerEmail,
    }));
  }

  function handleRepairSelectionChange(res: OsRepairSelectionResult) {
    setSelectedLines(res.lines);
    setQuoteNotes(res.quoteNotes);
    setForm((current) => {
      const trimmed = current.defect.trim();
      let nextDefect = current.defect;
      if (!trimmed || trimmed === lastAutoDefectRef.current) {
        nextDefect = res.summaryText;
      }
      lastAutoDefectRef.current = res.summaryText;
      return {
        ...current,
        labor: res.totalPrice,
        defect: nextDefect,
      };
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.customerName.trim() || !form.itemName.trim() || !form.defect.trim()) return;
    setError('');
    try {
      const created = await createWorkOrder({
        ...form,
        lines: selectedLines,
        quoteStatus: selectedLines.length > 0 ? 'approved' : 'none',
        quoteNotes,
        stockParts,
      });
      if (stockParts.length) void refreshStockFinance();
      setForm({ ...EMPTY, technician: profile.displayName });
      setSelectedLines([]);
      setStockParts([]);
      setQuoteNotes('');
      lastAutoDefectRef.current = '';
      setResetSignal((s) => s + 1);
      setCreatedOrder(created);
      setShareOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir OS.');
    }
  }

  return (
    <section className="admin-page">
      <article className="admin-card admin-card--form">
        <h2>Abrir ordem de serviço</h2>
        <p>
          Preencha os campos estruturados — evita jogar tudo em observações. Depois da abertura sai o
          relatório para imprimir ou guardar.
        </p>
        {error ? <p className="qty-low">{error}</p> : null}
        <form className="admin-form" onSubmit={(event) => void submit(event)}>
          <AdminPicker
            label="Cliente cadastrado"
            value=""
            placeholder="Selecionar…"
            options={customers.map((customer) => ({
              value: customer.id,
              label: `${customer.name} · ${customer.phone}`,
            }))}
            onChange={(value) => pickCustomer(value)}
          />
          <div className="quick-field__actions">
            <QuickAddButton label="Novo cliente" onClick={() => setQuickCustomerOpen(true)} />
          </div>
          {quickCustomerOpen ? (
            <QuickCreateCustomer
              initial={{ name: form.customerName, phone: form.customerPhone, document: form.customerDocument, email: form.customerEmail }}
              onClose={() => setQuickCustomerOpen(false)}
              onCreated={(customer) =>
                setForm((current) => ({
                  ...current,
                  customerName: customer.name,
                  customerPhone: customer.phone,
                  customerDocument: customer.document,
                  customerEmail: customer.email,
                }))
              }
            />
          ) : null}
          <label>
            Telefone
            <input
              value={form.customerPhone}
              onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
            />
          </label>
          <label>
            Nome do cliente
            <input
              value={form.customerName}
              onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              required
            />
          </label>
          <label>
            CPF / CNPJ
            <input
              value={form.customerDocument}
              onChange={(event) => setForm({ ...form, customerDocument: event.target.value })}
            />
          </label>
          <label className="span-2">
            E-mail
            <input
              type="email"
              value={form.customerEmail}
              onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
            />
          </label>

          <div className="span-2">
            <OsDeviceRepairSelector
              itemName={form.itemName}
              itemBrand={form.itemBrand}
              itemModel={form.itemModel}
              resetSignal={resetSignal}
              onSelectDevice={({ itemName: nextName, itemBrand: nextBrand, itemModel: nextModel }) => {
                setForm((current) => ({
                  ...current,
                  itemName: nextName,
                  itemBrand: nextBrand,
                  itemModel: nextModel,
                }));
              }}
              onSelectionChange={handleRepairSelectionChange}
            />
            <OsRepairPartsPicker brand={form.itemBrand} model={form.itemModel} serviceLines={selectedLines} resetSignal={resetSignal} onChange={setStockParts} />
          </div>

          <label>
            Cor
            <input
              value={form.itemColor}
              onChange={(event) => setForm({ ...form, itemColor: event.target.value })}
            />
          </label>
          <label>
            IMEI / série / ref.
            <input
              value={form.itemRef}
              onChange={(event) => setForm({ ...form, itemRef: event.target.value })}
            />
          </label>
          <label>
            Senha / padrão / PIN
            <input
              value={form.devicePassword}
              onChange={(event) => setForm({ ...form, devicePassword: event.target.value })}
              placeholder="Uso interno da oficina"
            />
          </label>
          <label className="span-2">
            Acessórios deixados
            <input
              value={form.accessories}
              onChange={(event) => setForm({ ...form, accessories: event.target.value })}
              placeholder="Capa, cabo, chip, fonte…"
            />
          </label>
          <label className="span-2">
            Estado na entrada
            <textarea
              value={form.conditionOnEntry}
              onChange={(event) => setForm({ ...form, conditionOnEntry: event.target.value })}
              placeholder="Riscos, amassados, tela trincada, etc."
            />
          </label>
          <label className="span-2">
            Defeito relatado
            <textarea
              value={form.defect}
              onChange={(event) => setForm({ ...form, defect: event.target.value })}
              required
            />
          </label>
          <label className="span-2">
            Diagnóstico inicial
            <textarea
              value={form.diagnosis}
              onChange={(event) => setForm({ ...form, diagnosis: event.target.value })}
              placeholder="Opcional — o que a oficina já identificou"
            />
          </label>
          <label>
            Técnico
            <input
              value={form.technician}
              onChange={(event) => setForm({ ...form, technician: event.target.value })}
            />
          </label>
          <AdminPicker
            label="Vendedor"
            value={form.sellerId}
            placeholder="Sem vendedor"
            options={sellers.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => setForm({ ...form, sellerId: value })}
          />
          <AdminPicker
            label="Prioridade"
            value={form.priority}
            options={[
              { value: 'low', label: PRIORITY_LABEL.low },
              { value: 'normal', label: PRIORITY_LABEL.normal },
              { value: 'high', label: PRIORITY_LABEL.high },
              { value: 'urgent', label: PRIORITY_LABEL.urgent },
            ]}
            onChange={(value) =>
              setForm({ ...form, priority: value as WorkOrderPriority })
            }
          />
          <label>
            Previsão de pronto
            <input
              type="date"
              value={form.estimatedReadyAt}
              onChange={(event) => setForm({ ...form, estimatedReadyAt: event.target.value })}
            />
          </label>
          <label>
            Mão de obra (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.labor}
              onChange={(event) => setForm({ ...form, labor: Number(event.target.value) || 0 })}
            />
          </label>
          <label>
            Peças estimadas (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.parts}
              onChange={(event) => setForm({ ...form, parts: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="span-2">
            Observações internas
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Só o que não cabe nos campos acima"
            />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="submit" className="btn btn--primary">
              Abrir OS e compartilhar
            </button>
            <Link to={osBase} className="btn btn--ghost">
              Voltar ao quadro
            </Link>
          </div>
        </form>
      </article>

      <OsCreatedShareModal
        open={shareOpen}
        order={createdOrder}
        authorName={profile.displayName}
        onClose={() => {
          setShareOpen(false);
          if (createdOrder) {
            navigate(osHref(osBase, `/${createdOrder.id}/relatorio`), { replace: true });
          }
        }}
        onContinueToOrder={(order) => {
          setShareOpen(false);
          navigate(osHref(osBase, `/${order.id}/relatorio`), { replace: true });
        }}
      />
    </section>
  );
}
