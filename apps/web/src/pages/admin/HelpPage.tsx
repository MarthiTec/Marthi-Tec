import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { useAuth } from '../../contexts/AuthContext';
import { MARTHI_COMPANY, marthiWhatsAppHref } from '../../data/companyContact';
import { userIsStoreAdmin } from '../../data/erpRegistry';
import { getOperatorProfile } from '../../data/operatorProfile';

const SUPPORT_KEY = 'marthi_support_tickets';

type SupportTicket = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  topic: string;
  message: string;
};

function loadTickets(): SupportTicket[] {
  try {
    const raw = localStorage.getItem(SUPPORT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SupportTicket[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTickets(tickets: SupportTicket[]) {
  localStorage.setItem(SUPPORT_KEY, JSON.stringify(tickets));
}

export function HelpPage() {
  const { user } = useAuth();
  const isAdmin = userIsStoreAdmin(user?.email);
  const profile = getOperatorProfile(user?.name ?? 'Operador');
  const [topic, setTopic] = useState('ajuste');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [tickets, setTickets] = useState(() => loadTickets());

  const waHref = useMemo(() => {
    return marthiWhatsAppHref(
      `Olá Marthi, sou ${profile.displayName} (${user?.email ?? ''}). Preciso de ajuda no painel.`,
    );
  }, [profile.displayName, user?.email]);

  if (!isAdmin) {
    return (
      <section className="admin-page">
        <article className="admin-card">
          <h2>Central de ajuda</h2>
          <p className="empty">Disponível apenas para operadores administrativos da loja.</p>
        </article>
      </section>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    const ticket: SupportTicket = {
      id: `sup_${Date.now()}`,
      createdAt: new Date().toISOString(),
      name: profile.displayName,
      email: user?.email ?? '',
      topic,
      message: message.trim(),
    };
    const next = [ticket, ...tickets].slice(0, 20);
    saveTickets(next);
    setTickets(next);
    setMessage('');
    setSent(true);
  }

  return (
    <section className="admin-page help-page">
      <div className="dash-hero">
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Suporte Marthi · operadores administrativos
          </p>
          <h1 className="dash-hero__title">Central de ajuda</h1>
        </div>
        <a href={waHref} className="btn btn--primary" target="_blank" rel="noreferrer">
          <AdminIcon name="whatsapp" />
          WhatsApp
        </a>
      </div>

      <div className="admin-grid help-grid">
        <article className="admin-card">
          <h2>Falar com a Marthi</h2>
          <p>
            Sede: {MARTHI_COMPANY.addressLine}. Totem, painel, plano ou ajuste operacional.
          </p>
          <div className="admin-toolbar admin-toolbar--stack">
            <a href={waHref} className="btn btn--primary" target="_blank" rel="noreferrer">
              <AdminIcon name="whatsapp" />
              WhatsApp {MARTHI_COMPANY.whatsappDisplay}
            </a>
            <a href={MARTHI_COMPANY.emailHref} className="btn btn--ghost">
              <AdminIcon name="mail" />
              {MARTHI_COMPANY.email}
            </a>
            <a
              href={MARTHI_COMPANY.instagramHref}
              className="btn btn--ghost"
              target="_blank"
              rel="noreferrer"
            >
              Instagram · @{MARTHI_COMPANY.instagramHandle}
            </a>
          </div>
        </article>

        <article className="admin-card">
          <h2>Solicitar ajuste</h2>
          <p>Registre o pedido aqui. Em seguida fale conosco pelo WhatsApp se for urgente.</p>
          <form className="admin-form help-form" onSubmit={submit}>
            <label>
              Assunto
              <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                <option value="ajuste">Ajuste no sistema</option>
                <option value="plano">Plano / contrato</option>
                <option value="acesso">Acesso / permissões</option>
                <option value="totem">Totem</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label className="admin-form__full">
              Mensagem
              <textarea
                rows={4}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setSent(false);
                }}
                placeholder="Descreva o que precisa…"
                required
              />
            </label>
            <div className="admin-form__full">
              <button type="submit" className="btn btn--primary">
                <AdminIcon name="mail" />
                Registrar pedido
              </button>
              {sent ? <p className="help-sent">Pedido registrado nesta loja.</p> : null}
            </div>
          </form>
        </article>
      </div>

      {tickets.length > 0 ? (
        <article className="admin-card">
          <h2>Pedidos recentes</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Assunto</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{new Date(ticket.createdAt).toLocaleString('pt-BR')}</td>
                  <td>{ticket.topic}</td>
                  <td>{ticket.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : null}

      <article className="admin-card">
        <h2>Links rápidos</h2>
        <div className="admin-toolbar">
          <Link to="/painel/plano" className="btn btn--ghost">
            <AdminIcon name="plan" />
            Plano da loja
          </Link>
          <Link to="/painel/permissoes" className="btn btn--ghost">
            <AdminIcon name="people" />
            Permissões
          </Link>
          <Link to="/painel/totem" className="btn btn--ghost">
            <AdminIcon name="totem" />
            Totem
          </Link>
        </div>
      </article>
    </section>
  );
}
