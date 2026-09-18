import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAdminState } from '../../data/adminStore';
import { getOperatorProfile } from '../../data/operatorProfile';
import { createWorkOrder, type WorkOrderPriority } from '../../data/osStore';
import { useAuth } from '../../contexts/AuthContext';

const EMPTY = {
  customerName: '',
  customerPhone: '',
  itemName: '',
  itemRef: '',
  defect: '',
  notes: '',
  technician: '',
  priority: 'normal' as WorkOrderPriority,
  labor: 0,
  parts: 0,
};

export function WorkOrderNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = getOperatorProfile(user?.name ?? 'Operador');
  const customers = getAdminState().customers;
  const [form, setForm] = useState({ ...EMPTY, technician: profile.displayName });

  function pickCustomer(id: string) {
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    setForm((current) => ({
      ...current,
      customerName: customer.name,
      customerPhone: customer.phone,
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.customerName.trim() || !form.itemName.trim() || !form.defect.trim()) return;
    const created = createWorkOrder(form);
    navigate(`/painel/os/${created.id}`, { replace: true });
  }

  return (
    <section className="admin-page">
      <article className="admin-card admin-card--form">
        <h2>Abrir ordem de serviço</h2>
        <p>Cliente, item e defeito entram aqui. O quadro da oficina pega o restante.</p>
        <form className="admin-form" onSubmit={submit}>
          <label>
            Cliente cadastrado
            <select defaultValue="" onChange={(event) => pickCustomer(event.target.value)}>
              <option value="">Selecionar…</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.phone}
                </option>
              ))}
            </select>
          </label>
          <label>
            Telefone
            <input
              value={form.customerPhone}
              onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
            />
          </label>
          <label className="span-2">
            Nome do cliente
            <input
              value={form.customerName}
              onChange={(event) => setForm({ ...form, customerName: event.target.value })}
              required
            />
          </label>
          <label>
            Item / equipamento
            <input
              value={form.itemName}
              onChange={(event) => setForm({ ...form, itemName: event.target.value })}
              placeholder="Celular, óculos, notebook…"
              required
            />
          </label>
          <label>
            Referência
            <input
              value={form.itemRef}
              onChange={(event) => setForm({ ...form, itemRef: event.target.value })}
              placeholder="IMEI, série, modelo"
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
          <label>
            Técnico
            <input
              value={form.technician}
              onChange={(event) => setForm({ ...form, technician: event.target.value })}
            />
          </label>
          <label>
            Prioridade
            <select
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value as WorkOrderPriority })
              }
            >
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
            </select>
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
            Peças (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.parts}
              onChange={(event) => setForm({ ...form, parts: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="span-2">
            Observações
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="submit" className="btn btn--primary">
              Abrir OS
            </button>
            <Link to="/painel/os" className="btn btn--ghost">
              Voltar ao quadro
            </Link>
          </div>
        </form>
      </article>
    </section>
  );
}
