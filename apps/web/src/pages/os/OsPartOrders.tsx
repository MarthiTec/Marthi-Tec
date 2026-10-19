import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickCreateSupplier } from '../../components/QuickCreate';
import { QuickAddButton, QuickModal } from '../../components/QuickModal';
import { refreshWorkOrders } from '../../data/erpBootstrap';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { refreshStockFinance } from '../../data/workshopLedger';
import { apiListSuppliers, type ApiSupplier } from '../../services/erpApi';
import {
  apiArrivePartOrder,
  apiCreatePartOrder,
  apiListPartOrders,
  apiListRepairParts,
  apiUpdatePartOrder,
  PART_ORDER_STATUS,
  type PartOrder,
  type PartOrderInput,
  type RepairPart,
} from '../../services/repairPartsApi';
import { repairMoney } from '../../services/repairsApi';
import { osHref, useOsBase } from './osPaths';
import './repairParts.css';

const plusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'sem prazo');
export const emptyPartOrder = (part?: RepairPart | null): PartOrderInput => ({
  stockId: part?.id ?? null,
  description: part ? part.name : '',
  qty: 1,
  unitCost: part ? part.cost : null,
  supplierId: null,
  supplierName: '',
  expectedAt: plusDays(3),
  deviceAtStore: true,
  notes: '',
});

function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return '';
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}?text=${encodeURIComponent(text)}`;
}

/** Fornecedor com cadastro rápido (+ Novo fornecedor) sem sair da tela. */
export function SupplierField({ value, onChange, label = 'Fornecedor (opcional)' }: { value: string | null; onChange: (id: string | null, name: string) => void; label?: string }) {
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [creating, setCreating] = useState(false);
  const load = () => apiListSuppliers(true).then(setSuppliers).catch(() => setSuppliers([]));
  useEffect(() => {
    void load();
  }, []);
  const nameOf = (id: string) => {
    const supplier = suppliers.find((item) => item.id === id);
    return supplier ? supplier.tradeName || supplier.name : '';
  };
  return (
    <div className="parts-supplier">
      <AdminPicker
        label={label}
        value={value ?? ''}
        searchable
        options={[{ value: '', label: 'Sem fornecedor' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.tradeName || supplier.name }))]}
        onChange={(id) => onChange(id || null, id ? nameOf(id) : '')}
      />
      <div className="quick-field__actions">
        <QuickAddButton label="Novo fornecedor" onClick={() => setCreating(true)} />
      </div>
      {creating ? (
        <QuickCreateSupplier
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            void apiListSuppliers(true)
              .then((list) => {
                setSuppliers(list);
                const supplier = list.find((item) => item.id === id);
                onChange(id, supplier ? supplier.tradeName || supplier.name : '');
              })
              .catch(() => onChange(id, ''));
          }}
        />
      ) : null}
    </div>
  );
}

/** Campos da encomenda: peça (do estoque da oficina ou descrita), quantidade, fornecedor, prazo e aparelho. */
export function PartOrderFields({ value, onChange, parts, lockPart = false }: { value: PartOrderInput; onChange: (next: PartOrderInput) => void; parts?: RepairPart[]; lockPart?: boolean }) {
  const set = (patch: Partial<PartOrderInput>) => onChange({ ...value, ...patch });
  return (
    <div className="parts-order-fields">
      {!lockPart ? (
        parts && parts.length ? (
          <AdminPicker
            label="Peça"
            value={value.stockId ?? ''}
            searchable
            options={[{ value: '', label: '✏️ Peça ainda não cadastrada (descrever)' }, ...parts.map((part) => ({ value: part.id, label: part.name, hint: `${part.qty} em estoque`, keywords: `${part.sku} ${part.links.map((link) => link.model).join(' ')}` }))]}
            onChange={(id) => {
              const part = parts.find((item) => item.id === id);
              set({ stockId: id || null, description: part ? part.name : '', unitCost: part ? part.cost : value.unitCost });
            }}
          />
        ) : null
      ) : null}
      {!value.stockId ? (
        <label>
          Peça a encomendar
          <input value={value.description} maxLength={200} placeholder="Ex.: TELA MOTO G04 COM ARO" onChange={(e) => set({ description: e.target.value.toUpperCase() })} />
        </label>
      ) : lockPart ? (
        <p className="parts-order-fields__part">
          <b>{value.description}</b>
        </p>
      ) : null}
      <div className="quick-modal__row">
        <label>
          Quantidade
          <input type="number" min={1} value={value.qty} onChange={(e) => set({ qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
        </label>
        <label>
          Custo previsto
          <CurrencyInput value={value.unitCost ?? 0} ariaLabel="Custo previsto da peça" onChange={(unitCost) => set({ unitCost })} />
        </label>
      </div>
      <SupplierField value={value.supplierId} onChange={(supplierId, supplierName) => set({ supplierId, supplierName })} />
      <div className="quick-modal__row">
        <label>
          Prazo combinado
          <input type="date" value={value.expectedAt ?? ''} onChange={(e) => set({ expectedAt: e.target.value || null })} />
        </label>
        <AdminPicker
          label="Aparelho"
          value={value.deviceAtStore ? 'store' : 'customer'}
          options={[
            { value: 'store', label: 'Fica na loja aguardando' },
            { value: 'customer', label: 'Cliente traz quando a peça chegar' },
          ]}
          onChange={(next) => set({ deviceAtStore: next === 'store' })}
        />
      </div>
      <label>
        Observação
        <input value={value.notes} maxLength={300} placeholder="Ex.: pedido 554 na distribuidora" onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </div>
  );
}

/** Peça chegou: custo real, financeiro e (se for de uma OS) já usar na OS. */
export function ArrivePartModal({ order, onClose, onDone }: { order: PartOrder; onClose: () => void; onDone: (order: PartOrder, usedOn: string | null) => void }) {
  const [unitCost, setUnitCost] = useState(order.unitCost ?? 0);
  const [payment, setPayment] = useState<'paid' | 'pending' | 'none'>('paid');
  const [dueDate, setDueDate] = useState(plusDays(30));
  const [useOnOrder, setUseOnOrder] = useState(Boolean(order.workOrderId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      const done = await apiArrivePartOrder(order.id, { unitCost, payment, dueDate: payment === 'pending' ? dueDate : '', useOnOrder });
      await Promise.all([refreshWorkOrders().catch(() => undefined), refreshStockFinance()]);
      onDone(done.order, done.usedOn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível receber a peça.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <QuickModal title="Peça chegou" subtitle={`${order.qty}× ${order.partName}${order.supplierName ? ` · ${order.supplierName}` : ''}`} submitLabel="Dar entrada" busy={busy} error={error} onClose={onClose} onSubmit={save}>
      <div className="quick-modal__row">
        <label>
          Custo unitário
          <CurrencyInput value={unitCost} ariaLabel="Custo unitário" onChange={setUnitCost} />
        </label>
        <AdminPicker
          label="Financeiro"
          value={payment}
          options={[
            { value: 'paid', label: 'Compra paga' },
            { value: 'pending', label: 'A pagar (contas a pagar)' },
            { value: 'none', label: 'Sem lançamento' },
          ]}
          onChange={(next) => setPayment(next as typeof payment)}
        />
      </div>
      {payment === 'pending' ? (
        <label>
          Vencimento
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      ) : null}
      {order.workOrderId ? (
        <label className="quick-modal__check">
          <input type="checkbox" checked={useOnOrder} onChange={(e) => setUseOnOrder(e.target.checked)} />
          Já separar a peça para a OS {order.workOrderId} (sai do estoque e a OS volta para “Aberta”)
        </label>
      ) : null}
      {!order.stockId ? <p className="repairs__muted">A peça “{order.partName}” ainda não tem cadastro: ela entra no estoque da oficina com esse nome.</p> : null}
    </QuickModal>
  );
}

function OrderRow({ order, onChanged, showOs = true }: { order: PartOrder; onChanged: () => void; showOs?: boolean }) {
  const osBase = useOsBase();
  const [arriving, setArriving] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = order.status === 'ordered';
  const notify = waLink(
    order.customerPhone,
    `Olá, ${order.customerName.split(' ')[0] || 'tudo bem'}! A peça do seu ${order.itemName || 'aparelho'} chegou${order.deviceAtStore ? ' e já vamos fazer o reparo.' : '. Pode trazer o aparelho quando quiser para fazermos o reparo.'}`,
  );
  async function reschedule() {
    const next = window.prompt('Novo prazo combinado com o fornecedor (dd/mm/aaaa):', br(order.expectedAt));
    if (!next) return;
    const match = next.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return window.alert('Use o formato dd/mm/aaaa.');
    await apiUpdatePartOrder(order.id, { expectedAt: `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` });
    onChanged();
  }
  async function cancel() {
    if (!window.confirm(`Cancelar a encomenda de ${order.partName}?`)) return;
    await apiUpdatePartOrder(order.id, { status: 'cancelled' });
    onChanged();
  }
  return (
    <li className={`parts-order${order.late ? ' is-late' : ''}${pending ? '' : ' is-closed'}`}>
      <div className="parts-order__main">
        <strong>
          {order.qty}× {order.partName}
        </strong>
        <small>
          {[order.supplierName || 'sem fornecedor', order.deviceAtStore ? 'aparelho na loja' : 'cliente traz quando chegar', order.notes].filter(Boolean).join(' · ')}
        </small>
        {showOs && order.workOrderId ? (
          <small>
            <Link to={osHref(osBase, `/${order.workOrderId}`)}>OS {order.workOrderId}</Link>
            {order.customerName ? ` · ${order.customerName}` : ''}
            {order.itemName ? ` · ${order.itemName}` : ''}
          </small>
        ) : null}
      </div>
      <div className="parts-order__when">
        <span className={`repair-parts__badge repair-parts__badge--${order.status === 'arrived' ? 'ok' : order.status === 'cancelled' ? 'out' : order.late ? 'out' : 'low'}`}>
          {order.status === 'ordered' && order.late ? 'Atrasada' : PART_ORDER_STATUS[order.status]}
        </span>
        <small>{order.status === 'arrived' ? `chegou ${order.arrivedAt ? new Date(order.arrivedAt).toLocaleDateString('pt-BR') : ''}` : `previsão ${br(order.expectedAt)}`}</small>
      </div>
      <div className="parts-order__actions">
        {pending ? (
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setArriving(true)}>
              Chegou
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reschedule()}>
              Prazo
            </button>
            <button type="button" className="btn btn--ghost btn--sm repairs__danger" onClick={() => void cancel()}>
              Cancelar
            </button>
          </>
        ) : order.status === 'arrived' && notify ? (
          <a className="btn btn--ghost btn--sm" href={notify} target="_blank" rel="noreferrer">
            Avisar cliente
          </a>
        ) : null}
      </div>
      {notice ? <p className="parts-order__notice">{notice}</p> : null}
      {arriving ? (
        <ArrivePartModal
          order={order}
          onClose={() => setArriving(false)}
          onDone={(_, usedOn) => {
            setArriving(false);
            setNotice(usedOn ? `Peça separada para a OS ${usedOn}.` : 'Peça no estoque da oficina.');
            onChanged();
          }}
        />
      ) : null}
    </li>
  );
}

/** Encomendas de peça de uma OS (na ficha da OS): ver, encomendar outra, receber. */
export function OsPartOrdersCard({ workOrderId, locked = false }: { workOrderId: string; locked?: boolean }) {
  const [orders, setOrders] = useState<PartOrder[] | null>(null);
  const [creating, setCreating] = useState(false);
  const load = () => apiListPartOrders({ workOrderId }).then(setOrders).catch(() => setOrders([]));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId]);
  if (orders === null) return null;
  return (
    <section className="parts-orders-card">
      <header>
        <div>
          <strong>Peças encomendadas</strong>
          <small>Sem a peça no estoque? Encomende com o prazo combinado; a OS fica “Aguardando” até a peça chegar.</small>
        </div>
        {!locked ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCreating(true)}>
            + Encomendar peça
          </button>
        ) : null}
      </header>
      {orders.length ? (
        <ul className="parts-orders">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} showOs={false} onChanged={() => void load()} />
          ))}
        </ul>
      ) : (
        <p className="repairs__muted">Nenhuma peça encomendada para esta OS.</p>
      )}
      {creating ? <NewPartOrderModal workOrderId={workOrderId} onClose={() => setCreating(false)} onSaved={() => (setCreating(false), void load(), void refreshWorkOrders().catch(() => undefined))} /> : null}
    </section>
  );
}

export function NewPartOrderModal({ workOrderId, onClose, onSaved }: { workOrderId: string | null; onClose: () => void; onSaved: (order: PartOrder) => void }) {
  const [parts, setParts] = useState<RepairPart[]>([]);
  const [value, setValue] = useState<PartOrderInput>(emptyPartOrder());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    apiListRepairParts().then(setParts).catch(() => setParts([]));
  }, []);
  async function save() {
    if (!value.stockId && value.description.trim().length < 2) return setError('Escolha a peça ou descreva o que vai ser encomendado.');
    setBusy(true);
    setError('');
    try {
      onSaved(await apiCreatePartOrder(workOrderId, value));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível encomendar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <QuickModal title="Encomendar peça" subtitle={workOrderId ? `Para a OS ${workOrderId}` : 'Reposição do estoque da oficina'} submitLabel="Encomendar" busy={busy} error={error} onClose={onClose} onSubmit={save}>
      <PartOrderFields value={value} onChange={setValue} parts={parts} />
    </QuickModal>
  );
}

/** Aba "Encomendas" das Peças de manutenção: o que está para chegar, atrasado e o que já chegou. */
export function PartOrdersPanel() {
  const [orders, setOrders] = useState<PartOrder[] | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [creating, setCreating] = useState(false);
  const load = () => apiListPartOrders(filter === 'pending' ? { status: 'ordered' } : undefined).then(setOrders).catch(() => setOrders([]));
  useEffect(() => {
    void load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  const late = useMemo(() => (orders ?? []).filter((order) => order.late).length, [orders]);
  return (
    <div className="parts-orders-panel">
      <div className="repair-parts__tools">
        <div className="os-cycle__view parts-orders-panel__filter" role="radiogroup" aria-label="Encomendas">
          <button type="button" role="radio" aria-checked={filter === 'pending'} className={filter === 'pending' ? 'is-on' : ''} onClick={() => setFilter('pending')}>
            Aguardando chegar
          </button>
          <button type="button" role="radio" aria-checked={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>
            Todas
          </button>
        </div>
        {late ? <span className="repair-parts__badge repair-parts__badge--out">{late} atrasada{late === 1 ? '' : 's'}</span> : null}
        <button type="button" className="btn btn--primary" style={{ marginLeft: 'auto' }} onClick={() => setCreating(true)}>
          + Encomendar peça
        </button>
      </div>
      {orders === null ? <p className="repairs__muted">Carregando encomendas…</p> : null}
      {orders && !orders.length ? <p className="repairs__muted">{filter === 'pending' ? 'Nenhuma peça aguardando chegar.' : 'Nenhuma encomenda ainda.'}</p> : null}
      {orders?.length ? (
        <ul className="parts-orders">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} onChanged={() => void load()} />
          ))}
        </ul>
      ) : null}
      <p className="repairs__muted">Na abertura da OS, uma peça sem estoque pode ser encomendada ali mesmo; na ficha da OS também. Custo previsto: {repairMoney((orders ?? []).filter((o) => o.status === 'ordered').reduce((sum, o) => sum + (o.unitCost ?? 0) * o.qty, 0))}.</p>
      {creating ? <NewPartOrderModal workOrderId={null} onClose={() => setCreating(false)} onSaved={() => (setCreating(false), void load())} /> : null}
    </div>
  );
}
