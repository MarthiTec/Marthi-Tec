import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { getOperatorProfile } from '../../data/operatorProfile';
import {
  apiCreateSupportTicket,
  apiGetSupportContacts,
  apiListSupportTickets,
  apiSaveSupportContacts,
  type SupportContacts,
  type SupportTicket,
} from '../../services/supportApi';

const TOPICS = [
  { value: 'ajuste', label: 'Ajuste no sistema' },
  { value: 'plano', label: 'Plano / contrato' },
  { value: 'acesso', label: 'Acesso / permissões' },
  { value: 'totem', label: 'Totem' },
  { value: 'outro', label: 'Outro' },
];
const topicLabel = (value: string) => TOPICS.find((item) => item.value === value)?.label ?? value;

/** Central de ajuda: contatos da Marthi (do banco) e pedidos de ajuste da loja. */
export function HelpPage() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'superadmin';
  const profile = getOperatorProfile(user?.name ?? 'Operador');
  const [contacts, setContacts] = useState<SupportContacts | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [topic, setTopic] = useState('ajuste');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [contactForm, setContactForm] = useState<{ email: string; instagram: string; whatsapp: string; address: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void apiGetSupportContacts()
        .then((data) => alive && setContacts(data))
        .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar os contatos.'));
      void apiListSupportTickets()
        .then((rows) => alive && setTickets(rows))
        .catch(() => undefined);
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, []);

  const waHref = contacts?.whatsappUrl
    ? `${contacts.whatsappUrl}?text=${encodeURIComponent(`Olá Marthi, sou ${profile.displayName} (${user?.email ?? ''}). Preciso de ajuda no painel.`)}`
    : '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const ticket = await apiCreateSupportTicket({ topic, message: message.trim() });
      setTickets((current) => [ticket, ...current]);
      setMessage('');
      setNotice('Pedido registrado. Se for urgente, chame no WhatsApp.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o pedido.');
    } finally {
      setSending(false);
    }
  }

  async function saveContacts() {
    if (!contactForm) return;
    setError('');
    try {
      const saved = await apiSaveSupportContacts(contactForm);
      setContacts(saved);
      setContactForm(null);
      setNotice('Contatos da Marthi atualizados para todas as lojas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os contatos.');
    }
  }

  return (
    <section className="admin-page help-page">
      <div className="dash-hero">
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Suporte Marthi
          </p>
          <h1 className="dash-hero__title">Central de ajuda</h1>
        </div>
        {waHref ? (
          <a href={waHref} className="btn btn--primary" target="_blank" rel="noreferrer">
            <AdminIcon name="whatsapp" />
            WhatsApp
          </a>
        ) : null}
      </div>

      {error ? <p role="alert" className="qty-low">{error}</p> : null}
      {notice ? <p role="status" className="help-sent">{notice}</p> : null}

      <div className="admin-grid help-grid">
        <article className="admin-card">
          <h2>Falar com a Marthi</h2>
          {!contacts ? (
            <p className="empty">Carregando contatos…</p>
          ) : (
            <>
              {contacts.address ? <p>Sede: {contacts.address}. Totem, painel, plano ou ajuste operacional.</p> : null}
              <div className="admin-toolbar admin-toolbar--stack">
                {waHref ? (
                  <a href={waHref} className="btn btn--primary" target="_blank" rel="noreferrer">
                    <AdminIcon name="whatsapp" />
                    WhatsApp {contacts.whatsappDisplay}
                  </a>
                ) : null}
                {contacts.email ? (
                  <a href={`mailto:${contacts.email}`} className="btn btn--ghost">
                    <AdminIcon name="mail" />
                    {contacts.email}
                  </a>
                ) : null}
                {contacts.instagram ? (
                  <a href={contacts.instagramUrl} className="btn btn--ghost" target="_blank" rel="noreferrer">
                    Instagram · @{contacts.instagram}
                  </a>
                ) : null}
              </div>
              {isPlatformAdmin && !contactForm ? (
                <button
                  type="button"
                  className="quick-add-btn"
                  style={{ marginTop: 12 }}
                  onClick={() => setContactForm({ email: contacts.email, instagram: contacts.instagram, whatsapp: contacts.whatsapp, address: contacts.address })}
                >
                  Editar contatos da Marthi
                </button>
              ) : null}
              {contactForm ? (
                <div className="admin-form" style={{ marginTop: 12 }}>
                  <label>
                    E-mail
                    <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
                  </label>
                  <label>
                    Instagram
                    <input value={contactForm.instagram} placeholder="@marthi.tecnologia" onChange={(e) => setContactForm({ ...contactForm, instagram: e.target.value })} />
                  </label>
                  <label>
                    WhatsApp
                    <input value={contactForm.whatsapp} inputMode="tel" onChange={(e) => setContactForm({ ...contactForm, whatsapp: e.target.value })} />
                  </label>
                  <label>
                    Endereço
                    <input value={contactForm.address} onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })} />
                  </label>
                  <div className="admin-toolbar span-2">
                    <button type="button" className="btn btn--primary" onClick={() => void saveContacts()}>
                      Salvar contatos
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => setContactForm(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className="admin-card">
          <h2>Solicitar ajuste</h2>
          <p>Registre o pedido aqui. Em seguida fale conosco pelo WhatsApp se for urgente.</p>
          <form className="admin-form help-form" onSubmit={(event) => void submit(event)}>
            <div>
              <AdminPicker label="Assunto" value={topic} options={TOPICS} onChange={(val) => setTopic(val)} />
            </div>
            <label className="admin-form__full">
              Mensagem
              <textarea
                rows={4}
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setNotice('');
                }}
                placeholder="Descreva o que precisa…"
                required
              />
            </label>
            <div className="admin-form__full">
              <button type="submit" className="btn btn--primary" disabled={sending}>
                <AdminIcon name="mail" />
                {sending ? 'Registrando…' : 'Registrar pedido'}
              </button>
            </div>
          </form>
        </article>
      </div>

      {tickets.length > 0 ? (
        <article className="admin-card">
          <h2>Pedidos recentes da loja</h2>
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Assunto</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{new Date(ticket.createdAt).toLocaleString('pt-BR')}</td>
                    <td>{ticket.userName || ticket.userEmail}</td>
                    <td>{topicLabel(ticket.topic)}</td>
                    <td>{ticket.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <article className="admin-card">
        <h2>Links rápidos</h2>
        <div className="admin-toolbar">
          <Link to="/painel/plano" className="btn btn--ghost">
            <AdminIcon name="plan" />
            Plano da loja
          </Link>
          <Link to="/painel/pessoas?aba=permissoes" className="btn btn--ghost">
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
