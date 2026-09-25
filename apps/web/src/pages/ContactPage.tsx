import { useState, type FormEvent } from 'react';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { MARTHI_COMPANY, marthiWhatsAppHref } from '../data/companyContact';
import { ingestContactLeadToCrm } from '../data/crmStore';
import './publicPages.css';

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function ContactPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [subject, setSubject] = useState('Demonstração');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setLoading(true);

    try {
      const fullMessage = [
        `[Assunto: ${subject}]`,
        company ? `Empresa/Loja: ${company}` : '',
        `E-mail: ${email}`,
        '',
        `Mensagem: ${message}`,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await ingestContactLeadToCrm({
        name: name.trim(),
        email: email.trim(),
        whatsapp: phone.trim(),
        message: fullMessage,
      });

      if (!result.ok) {
        setFeedback({ type: 'err', text: result.error || 'Erro ao registrar contato. Tente novamente.' });
        return;
      }

      setFeedback({
        type: 'ok',
        text: 'Mensagem recebida com sucesso! Seu contato foi registrado e nossa equipe entrará em contato pelo WhatsApp informado em instantes.',
      });

      setName('');
      setPhone('');
      setEmail('');
      setCompany('');
      setMessage('');
    } catch {
      setFeedback({ type: 'err', text: 'Não foi possível enviar a mensagem. Verifique sua conexão.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="public-page">
      <PublicHeader />

      <main className="public-page__main">
        {/* Hero */}
        <section className="public-hero">
          <span className="public-hero__badge">Canais de Atendimento</span>
          <h1>Fale com a equipe Marthi Tecnologia.</h1>
          <p>
            Quer entender qual plano melhor atende sua loja, agendar uma demonstração guiada ou tirar
            dúvidas operacionais? Estamos à disposição.
          </p>
        </section>

        {/* Layout Formulário + Contatos */}
        <section className="contact-layout">
          {/* Card Formulário */}
          <div className="contact-form-card">
            <h2>Envie uma mensagem</h2>
            <p>Preencha os campos abaixo e nosso consultor responderá com prioridade.</p>

            <form className="contact-form" onSubmit={handleSubmit}>
              <label>
                Seu Nome Completo *
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Carlos Mendes"
                  required
                />
              </label>

              <label>
                WhatsApp com DDD *
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex.: (24) 98124-4253"
                  required
                />
              </label>

              <label>
                Seu E-mail *
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com.br"
                  required
                />
              </label>

              <label>
                Nome da Loja / Empresa
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Ex.: Auto Peças Central"
                />
              </label>

              <label className="span-full">
                Assunto de Interesse
                <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="Demonstração">Agendar Demonstração Guiada</option>
                  <option value="Dúvida sobre Planos">Dúvidas sobre Módulos e Preços</option>
                  <option value="Totem Touch">Informações sobre Totem de Autoatendimento</option>
                  <option value="Oficina / OS">Dúvidas sobre Ordem de Serviço & Oficina</option>
                  <option value="PDV / Caixa">Dúvidas sobre Frente de Caixa & Emissão Fiscal</option>
                  <option value="Parceria Comercial">Parceria Comercial / Representação</option>
                  <option value="Outros">Outro Assunto</option>
                </select>
              </label>

              <label className="span-full">
                Como podemos te ajudar? *
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Conte um pouco sobre sua operação atual e suas expectativas com a Marthi…"
                  required
                />
              </label>

              <div className="span-full">
                <button type="submit" disabled={loading}>
                  {loading ? 'Enviando mensagem…' : 'Enviar Mensagem para a Equipe'}
                </button>
              </div>

              {feedback ? (
                <div
                  className={`span-full contact-feedback-box ${
                    feedback.type === 'err' ? 'contact-feedback-box--err' : ''
                  }`}
                  role="status"
                >
                  {feedback.text}
                </div>
              ) : null}
            </form>
          </div>

          {/* Coluna Lateral Informações Diretas */}
          <div className="contact-info-col">
            {/* Card WhatsApp Instantâneo */}
            <div className="contact-direct-card">
              <h3>Prefere falar agora?</h3>
              <p>
                Nosso canal direto no WhatsApp é a forma mais rápida de receber uma demonstração ou
                atendimento comercial.
              </p>
              <a
                href={marthiWhatsAppHref('Olá Marthi! Gostaria de falar sobre o sistema para minha loja.')}
                target="_blank"
                rel="noreferrer"
                className="btn-wa"
              >
                <IconWhatsApp />
                Abrir WhatsApp: {MARTHI_COMPANY.whatsappDisplay}
              </a>
            </div>

            {/* Card Detalhes da Sede */}
            <div className="contact-details-card">
              <h4>Informações da Empresa</h4>

              <div className="contact-detail-row">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
                </svg>
                <div>
                  <strong>Sede Presencial</strong>
                  <span>{MARTHI_COMPANY.venue}</span>
                  <span>{MARTHI_COMPANY.district} — {MARTHI_COMPANY.city} / {MARTHI_COMPANY.stateUf}</span>
                </div>
              </div>

              <div className="contact-detail-row">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                </svg>
                <div>
                  <strong>E-mail Institucional</strong>
                  <a href={MARTHI_COMPANY.emailHref} style={{ color: '#0f766e', textDecoration: 'none' }}>
                    {MARTHI_COMPANY.email}
                  </a>
                </div>
              </div>

              <div className="contact-detail-row">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
                <div>
                  <strong>Horário de Atendimento</strong>
                  <span>Segunda a Sexta: 08:00 às 18:00</span>
                  <span>Sábados: 08:00 às 12:00</span>
                </div>
              </div>

              <div className="contact-detail-row">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
                <div>
                  <strong>Instagram Oficial</strong>
                  <a
                    href={MARTHI_COMPANY.instagramHref}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0f766e', textDecoration: 'none' }}
                  >
                    @{MARTHI_COMPANY.instagramHandle}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
