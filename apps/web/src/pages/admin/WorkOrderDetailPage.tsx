import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BOARD_COLUMNS,
  getWorkOrder,
  PRIORITY_LABEL,
  STATUS_LABEL,
  updateWorkOrder,
  workOrderTotal,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const current = getWorkOrder(id);
  const [form, setForm] = useState(current);
  const [saved, setSaved] = useState(false);

  if (!current || !form) {
    return (
      <section className="admin-page">
        <article className="admin-card">
          <h2>OS não encontrada</h2>
          <p>Essa ordem não está no histórico local.</p>
          <Link to="/painel/os" className="btn btn--ghost">
            Voltar ao quadro
          </Link>
        </article>
      </section>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    updateWorkOrder(form.id, form);
    setSaved(true);
  }

  function setStatus(status: WorkOrderStatus) {
    if (!form) return;
    const next = updateWorkOrder(form.id, { status });
    if (next) setForm(next);
    setSaved(true);
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <div className="os-detail__top">
          <div>
            <h2>{form.id}</h2>
            <p>
              {form.customerName} · {form.customerPhone || 'sem telefone'}
            </p>
          </div>
          <strong>{money(workOrderTotal(form))}</strong>
        </div>
        <div className="os-flow">
          {[...BOARD_COLUMNS, 'delivered' as const, 'cancelled' as const].map((status) => (
            <button
              key={status}
              type="button"
              className={`os-flow__step ${form.status === status ? 'is-current' : ''}`}
              onClick={() => setStatus(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </article>

      <article className="admin-card admin-card--form">
        <h2>Dados da OS</h2>
        <form className="admin-form" onSubmit={submit}>
          <label>
            Cliente
            <input
              value={form.customerName}
              onChange={(event) => {
                setForm({ ...form, customerName: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Telefone
            <input
              value={form.customerPhone}
              onChange={(event) => {
                setForm({ ...form, customerPhone: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Item / equipamento
            <input
              value={form.itemName}
              onChange={(event) => {
                setForm({ ...form, itemName: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Referência
            <input
              value={form.itemRef}
              onChange={(event) => {
                setForm({ ...form, itemRef: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Defeito relatado
            <textarea
              value={form.defect}
              onChange={(event) => {
                setForm({ ...form, defect: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Técnico
            <input
              value={form.technician}
              onChange={(event) => {
                setForm({ ...form, technician: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Prioridade
            <select
              value={form.priority}
              onChange={(event) => {
                setForm({ ...form, priority: event.target.value as WorkOrderPriority });
                setSaved(false);
              }}
            >
              <option value="low">{PRIORITY_LABEL.low}</option>
              <option value="normal">{PRIORITY_LABEL.normal}</option>
              <option value="high">{PRIORITY_LABEL.high}</option>
            </select>
          </label>
          <label>
            Mão de obra (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.labor}
              onChange={(event) => {
                setForm({ ...form, labor: Number(event.target.value) || 0 });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Peças (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.parts}
              onChange={(event) => {
                setForm({ ...form, parts: Number(event.target.value) || 0 });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Observações internas
            <textarea
              value={form.notes}
              onChange={(event) => {
                setForm({ ...form, notes: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="submit" className="btn btn--primary">
              Salvar OS
            </button>
            <Link to="/painel/os" className="btn btn--ghost">
              Voltar ao quadro
            </Link>
            {saved ? <span className="empty">OS atualizada.</span> : null}
          </div>
        </form>
      </article>
    </section>
  );
}
