import { useEffect, useState } from 'react';
import { nestGet, nestPut } from '../services/nestClient';
import { AdminPicker } from './AdminPicker';

type Settings = { enabled: boolean; hour: number; customerTemplate: string; storeTemplate: string };
type ReminderLog = {
  id: string;
  source: 'pickup' | 'commercial';
  refId: string;
  date: string;
  customerName: string;
  productName: string;
  customerStatus: string;
  storeStatus: string;
  error: string;
  sentAt: string | null;
};

const STATUS: Record<string, string> = { sent: 'Enviado', failed: 'Falhou', skipped: 'Sem número', pending: 'Pendente' };
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6).map((h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

/** Lembrete automático de chegada da encomenda (WhatsApp ao cliente e à loja), gravado na loja. */
export function OrderReminderSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [log, setLog] = useState<ReminderLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    nestGet<Settings>('/order-reminders/settings').then(setSettings).catch((err) => setMessage(err instanceof Error ? err.message : 'Não foi possível carregar.'));
    nestGet<ReminderLog[]>('/order-reminders').then(setLog).catch(() => undefined);
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      setSettings(await nestPut<Settings>('/order-reminders/settings', settings));
      setMessage('Lembrete salvo.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return message ? <p className="empty">{message}</p> : null;
  return (
    <article className="admin-card order-reminder">
      <header>
        <h2>Lembrete de chegada da encomenda</h2>
        <p className="empty">
          No dia previsto de chegada (venda com retirada por encomenda ou Encomendas &amp; Ofertas), o cliente recebe no WhatsApp que o produto está a caminho e a loja recebe um lembrete
          no número da loja. Use {'{cliente}'}, {'{produto}'}, {'{loja}'}, {'{telefone}'} e {'{data}'} nos textos.
        </p>
      </header>
      <div className="admin-form order-reminder__grid">
        <label className="order-reminder__check">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
          Enviar lembrete automático
        </label>
        <AdminPicker label="Horário de envio" value={String(settings.hour)} options={HOURS} onChange={(value) => setSettings({ ...settings, hour: Number(value) })} />
        <label className="order-reminder__wide">
          Mensagem para o cliente
          <textarea rows={3} maxLength={1000} value={settings.customerTemplate} onChange={(e) => setSettings({ ...settings, customerTemplate: e.target.value })} />
        </label>
        <label className="order-reminder__wide">
          Lembrete para a loja
          <textarea rows={2} maxLength={1000} value={settings.storeTemplate} onChange={(e) => setSettings({ ...settings, storeTemplate: e.target.value })} />
        </label>
      </div>
      <div className="order-reminder__actions">
        {message ? <span>{message}</span> : <span />}
        <button type="button" className="btn btn--primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar lembrete'}
        </button>
      </div>
      {log.length ? (
        <div className="order-reminder__log">
          <h3>Últimos lembretes</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Produto</th>
                <th>Cliente</th>
                <th>Loja</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row) => (
                <tr key={row.id} title={row.error || undefined}>
                  <td>{row.date.split('-').reverse().join('/')}</td>
                  <td>{row.customerName}</td>
                  <td>{row.productName}</td>
                  <td>{STATUS[row.customerStatus] ?? row.customerStatus}</td>
                  <td>{STATUS[row.storeStatus] ?? row.storeStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
