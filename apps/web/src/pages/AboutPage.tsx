import { Link } from 'react-router-dom';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { MARTHI_COMPANY, marthiWhatsAppHref } from '../data/companyContact';
import './publicPages.css';

export function AboutPage() {
  return (
    <div className="public-page">
      <PublicHeader />

      <main className="public-page__main">
        {/* Hero */}
        <section className="public-hero">
          <span className="public-hero__badge">Nossa História & Propósito</span>
          <h1>Tecnologia prática criada para quem faz o comércio acontecer.</h1>
          <p>
            Desenvolvemos soluções que unem software intuitivo e hardware moderno para transformar a
            rotina de lojas, assistências e empresas de serviços em todo o Brasil.
          </p>
        </section>

        {/* História e Origem */}
        <section className="about-story">
          <div className="about-story__content">
            <span className="public-hero__badge">Quem somos</span>
            <h2>Nascidos para simplificar o dia a dia do empreendedor.</h2>
            <p>
              A <strong>Marthi Tecnologia</strong> nasceu na cidade de Três Rios — RJ com uma missão
              clara: acabar com softwares pesados, antiquados e cheios de menus complicados que mais
              atrapalham do que ajudam o comerciante brasileiro.
            </p>
            <p>
              Entendemos que o ritmo do balcão não pode esperar. Cada segundo que um operador de caixa
              perde com travamentos, cada ordem de serviço anotada em papel que se extravia, e cada
              fechamento fiscal doloroso representam prejuízo real.
            </p>
            <p>
              Por isso, criamos um ecossistema completo onde tudo se comunica: o totem na entrada da loja,
              o caixa no balcão, a bancada de manutenção na oficina e o estoque na nuvem.
            </p>
          </div>

          <div className="about-story__image-wrap">
            <img
              src="/home/equipe.jpg"
              alt="Equipe e estrutura da Marthi Tecnologia"
              loading="eager"
            />
          </div>
        </section>

        {/* Números e Destaques */}
        <section className="about-stats">
          <div className="about-stats__inner">
            <div>
              <p className="about-stats__number">100%</p>
              <p className="about-stats__label">Focado no Comércio Real</p>
            </div>
            <div>
              <p className="about-stats__number">8</p>
              <p className="about-stats__label">Módulos Especializados</p>
            </div>
            <div>
              <p className="about-stats__number">1</p>
              <p className="about-stats__label">Único Ecossistema Integrado</p>
            </div>
            <div>
              <p className="about-stats__number">0</p>
              <p className="about-stats__label">Contratos com Pegadinhas</p>
            </div>
          </div>
        </section>

        {/* Pilares Marthi */}
        <section className="about-pillars">
          <div className="about-pillars__head">
            <span className="public-hero__badge">Nossos Pilares</span>
            <h2>O que nos torna diferentes</h2>
            <p>Os três princípios que guiam cada linha de código e cada atendimento que realizamos.</p>
          </div>

          <div className="about-pillars__grid">
            <article className="about-pillar-card">
              <div className="about-pillar-card__icon">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                  <path d="M4 6h16v10H4z M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zm6 18h8v2H8v-2z" />
                </svg>
              </div>
              <h3>Hardware + Software em Harmonia</h3>
              <p>
                Não entregamos apenas telas na web. Nossos totens touch de autoatendimento, impressoras
                térmicas, leitores de código de barras e computadores funcionam em perfeita sintonia, sem
                dores de cabeça de compatibilidade.
              </p>
            </article>

            <article className="about-pillar-card">
              <div className="about-pillar-card__icon">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <h3>Simplicidade na Ponta dos Dedos</h3>
              <p>
                Eliminamos menus confusos e termos complicados. Qualquer funcionário da sua equipe aprende
                a operar o PDV, abrir uma OS ou lançar um produto em poucos minutos de treino.
              </p>
            </article>

            <article className="about-pillar-card">
              <div className="about-pillar-card__icon">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                </svg>
              </div>
              <h3>Suporte Humanizado de Verdade</h3>
              <p>
                Nada de robôs com respostas genéricas ou tickets que demoram dias. Nosso atendimento é
                realizado por especialistas que conhecem o comércio e atendem direto pelo WhatsApp.
              </p>
            </article>
          </div>
        </section>

        {/* Localização & Convite */}
        <section style={{ maxWidth: '1000px', margin: '0 auto 80px', padding: '0 20px' }}>
          <div
            style={{
              padding: 'clamp(32px, 5vw, 48px)',
              borderRadius: '28px',
              background: '#ffffff',
              border: '1px solid rgba(18, 21, 26, 0.08)',
              boxShadow: '0 20px 48px rgba(18, 21, 26, 0.06)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '32px',
              alignItems: 'center',
            }}
          >
            <div>
              <span className="public-hero__badge">Nossa Sede</span>
              <h3 style={{ margin: '0 0 12px', fontSize: '1.6rem', fontWeight: 750 }}>
                {MARTHI_COMPANY.venue}
              </h3>
              <p style={{ margin: '0 0 16px', color: '#475569', lineHeight: 1.55 }}>
                Estamos localizados no coração de Três Rios — RJ. Atendemos lojistas presencialmente na
                região e remotamente em todo o território nacional com velocidade e dedicação.
              </p>
              <p style={{ margin: '0', color: '#0f766e', fontWeight: 650 }}>
                📍 {MARTHI_COMPANY.addressLine}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link
                to="/produtos"
                className="plan-card__cta plan-card__cta--primary"
                style={{ textAlign: 'center' }}
              >
                Conhecer Nossos Produtos
              </Link>
              <a
                href={marthiWhatsAppHref('Olá! Conheci a história da Marthi e gostaria de bater um papo.')}
                target="_blank"
                rel="noreferrer"
                className="plan-card__cta plan-card__cta--ghost"
                style={{ textAlign: 'center' }}
              >
                Falar com a Equipe no WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
