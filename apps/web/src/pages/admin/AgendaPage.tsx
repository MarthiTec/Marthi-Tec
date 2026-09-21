import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  addDays,
  getAgendaWeek,
  listOverdueWorkOrders,
  listTechnicians,
  listUnscheduledWorkOrders,
  PRIORITY_LABEL,
  setWorkOrderReadyDate,
  startOfWeekMonday,
  STATUS_LABEL,
  toDateKey,
  workOrderReadyDate,
  type WorkOrder,
} from '../../data/osStore';
import { osHref, useOsBase } from '../os/osPaths';

const WEEKDAY = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

function formatDayHeading(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatWeekRange(monday: Date) {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  return `${monday.toLocaleDateString('pt-BR', opts)} – ${sunday.toLocaleDateString('pt-BR', opts)}`;
}

function AgendaCard({
  order,
  osBase,
  onDateChange,
}: {
  order: WorkOrder;
  osBase: string;
  onDateChange: (id: string, date: string) => void | Promise<void>;
}) {
  return (
    <article className={`os-agenda__card os-agenda__card--${order.priority}`}>
      <Link to={osHref(osBase, `/${order.id}`)} className="os-agenda__card-link">
        <strong>{order.id}</strong>
        <span>{order.customerName}</span>
        <span className="os-agenda__card-item">{order.itemName}</span>
      </Link>
      <div className="os-agenda__card-meta">
        <span>{STATUS_LABEL[order.status]}</span>
        <span>{PRIORITY_LABEL[order.priority]}</span>
        {order.technician ? <span>{order.technician}</span> : <span>Sem técnico</span>}
      </div>
      <label className="os-agenda__date">
        Previsão
        <input
          type="date"
          value={workOrderReadyDate(order) ?? ''}
          onChange={(event) => void onDateChange(order.id, event.target.value)}
        />
      </label>
    </article>
  );
}

export function AgendaPage() {
  const osBase = useOsBase();
  const [params, setParams] = useSearchParams();
  const technician = params.get('tech') || 'all';
  const weekParam = params.get('week');
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    return () => {
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
    };
  }, []);

  const anchor = useMemo(() => {
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      const [y, m, d] = weekParam.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [weekParam]);

  const monday = useMemo(() => startOfWeekMonday(anchor), [anchor]);
  const todayKey = toDateKey(new Date());
  const technicians = useMemo(() => listTechnicians(), [tick]);
  const week = useMemo(() => getAgendaWeek(monday, technician), [monday, technician, tick]);
  const unscheduled = useMemo(
    () => listUnscheduledWorkOrders(technician),
    [technician, tick],
  );
  const overdue = useMemo(() => listOverdueWorkOrders(technician), [technician, tick]);

  function setTechnician(value: string) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('tech');
    else next.set('tech', value);
    setParams(next, { replace: true });
  }

  function shiftWeek(delta: number) {
    const nextMonday = addDays(monday, delta * 7);
    const next = new URLSearchParams(params);
    next.set('week', toDateKey(nextMonday));
    setParams(next, { replace: true });
  }

  function goToday() {
    const next = new URLSearchParams(params);
    next.delete('week');
    setParams(next, { replace: true });
  }

  async function changeDate(id: string, date: string) {
    const result = await setWorkOrderReadyDate(id, date);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(date ? 'Previsão atualizada.' : 'Previsão removida.');
    setTick((value) => value + 1);
  }

  const weekTotal = week.reduce((sum, day) => sum + day.orders.length, 0);

  return (
    <section className="admin-page">
      <div className="admin-toolbar os-agenda__toolbar">
        <div className="os-agenda__nav">
          <button type="button" className="btn btn--ghost" onClick={() => shiftWeek(-1)}>
            Semana anterior
          </button>
          <button type="button" className="btn btn--ghost" onClick={goToday}>
            Hoje
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => shiftWeek(1)}>
            Próxima semana
          </button>
          <strong>{formatWeekRange(monday)}</strong>
        </div>
        <AdminPicker
          compact
          className="os-agenda__tech"
          label="Técnico"
          value={technician}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'unassigned', label: 'Sem técnico' },
            ...technicians.map((name) => ({ value: name, label: name })),
          ]}
          onChange={setTechnician}
        />
        <Link to={osHref(osBase, '/nova')} className="btn btn--primary">
          Nova OS
        </Link>
      </div>

      {message ? <p className="empty">{message}</p> : null}

      <div className="admin-grid os-agenda__stats">
        <article className="admin-card">
          <h2>Nesta semana</h2>
          <strong>{weekTotal}</strong>
          <p>OS com previsão no período.</p>
        </article>
        <article className="admin-card">
          <h2>Atrasadas</h2>
          <strong>{overdue.length}</strong>
          <p>Previsão vencida e ainda em oficina.</p>
        </article>
        <article className="admin-card">
          <h2>Sem data</h2>
          <strong>{unscheduled.length}</strong>
          <p>Ativas sem previsão de pronto.</p>
        </article>
      </div>

      <div className="os-agenda__layout">
        <div className="os-agenda__week">
          {week.map((day, index) => {
            const isToday = day.date === todayKey;
            return (
              <section
                key={day.date}
                className={`os-agenda__day ${isToday ? 'is-today' : ''}`}
              >
                <header>
                  <span>{WEEKDAY[index]}</span>
                  <strong>{formatDayHeading(day.date)}</strong>
                  <em>{day.orders.length}</em>
                </header>
                <div className="os-agenda__day-body">
                  {day.orders.length === 0 ? (
                    <p className="empty">Livre</p>
                  ) : (
                    day.orders.map((order) => (
                      <AgendaCard key={order.id} order={order} osBase={osBase} onDateChange={changeDate} />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="os-agenda__side">
          {overdue.length > 0 ? (
            <article className="admin-card">
              <h2>Atrasadas</h2>
              <div className="os-agenda__side-list">
                {overdue.map((order) => (
                  <AgendaCard key={order.id} order={order} osBase={osBase} onDateChange={changeDate} />
                ))}
              </div>
            </article>
          ) : null}
          <article className="admin-card">
            <h2>Sem previsão</h2>
            <p>Defina a data para aparecer na semana.</p>
            {unscheduled.length === 0 ? (
              <p className="empty">Todas as OS ativas têm data.</p>
            ) : (
              <div className="os-agenda__side-list">
                {unscheduled.map((order) => (
                  <AgendaCard key={order.id} order={order} osBase={osBase} onDateChange={changeDate} />
                ))}
              </div>
            )}
          </article>
        </aside>
      </div>
    </section>
  );
}
