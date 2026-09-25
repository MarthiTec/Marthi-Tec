import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { getAdminState } from '../../data/adminStore';
import { listSellers } from '../../data/erpRegistry';
import { getOperatorProfile } from '../../data/operatorProfile';
import { createWorkOrder, PRIORITY_LABEL, type WorkOrder, type WorkOrderPriority } from '../../data/osStore';
import { useAuth } from '../../contexts/AuthContext';
import { osHref, useOsBase } from '../os/osPaths';
import { OsCreatedShareModal } from '../os/OsCreatedShareModal';

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
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<WorkOrder | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.customerName.trim() || !form.itemName.trim() || !form.defect.trim()) return;
    setError('');
    try {
      const created = await createWorkOrder(form);
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

          <label>
            Equipamento
            <input
              value={form.itemName}
              onChange={(event) => setForm({ ...form, itemName: event.target.value })}
              placeholder="Ex.: iPhone 15, Notebook Dell"
              required
            />
          </label>
          <label>
            Marca
            <input
              value={form.itemBrand}
              onChange={(event) => setForm({ ...form, itemBrand: event.target.value })}
            />
          </label>
          <label>
            Modelo
            <input
              value={form.itemModel}
              onChange={(event) => setForm({ ...form, itemModel: event.target.value })}
            />
          </label>
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
