import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import './home.css';

const PLANS = [
  {
    id: 'start',
    name: 'Start',
    price: 'R$ 297',
    period: '/mês',
    blurb: 'Uma loja, um totem, operação enxuta.',
    features: [
      '1 totem de autoatendimento',
      'Painel web da loja',
      'Leads via WhatsApp (Evolution)',
      'Catálogo e preços',
      'Suporte em horário comercial',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 'R$ 597',
    period: '/mês',
    blurb: 'Multi-totem e operação com mais ritmo.',
    featured: true,
    features: [
      'Até 3 totens',
      'Multi-usuário no painel',
      'Relatórios de interesse',
      'Personalização de marca da loja',
      'Prioridade no suporte',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 'Sob consulta',
    period: '',
    blurb: 'Rede, ERP e ordem de serviço sob medida.',
    features: [
      'Totens ilimitados*',
      'Roadmap ERP + OS online',
      'Integrações sob demanda',
      'Ambiente dedicado',
      'Acompanhamento comercial',
    ],
  },
] as const;

const PRODUCTS = [
  {
    title: 'Totem de autoatendimento',
    text: 'Touch grande, carrossel de fotos, fluxo guiado e lead no WhatsApp da loja — em qualquer segmento.',
    href: '/totem',
    cta: 'Ver demo Cell Ponto',
  },
  {
    title: 'Painel da loja',
    text: 'Acesso com login próprio (ex.: Cell Ponto). Catálogo, operação e visão do que o cliente escolheu no totem.',
    href: '/login',
    cta: 'Entrar no painel',
  },
  {
    title: 'OS + ERP (roadmap)',
    text: 'Ordem de serviço e gestão online interligadas ao totem — do interesse à entrega, num só sistema.',
    href: '#planos',
    cta: 'Ver planos',
  },
] as const;

const SEGMENTS = [
  {
    id: 'celulares',
    label: 'Celulares',
    brand: 'Cell Ponto',
    line: 'Escolha o aparelho. Confirme. WhatsApp da loja.',
    hint: 'Demo ativa desta plataforma',
  },
  {
    id: 'otica',
    label: 'Ótica',
    brand: 'Sua ótica',
    line: 'Armação, lentes e agendamento no totem.',
    hint: 'Mesmo motor, outra fachada',
  },
  {
    id: 'moda',
    label: 'Moda',
    brand: 'Sua loja',
    line: 'Lookbook touch e interesse direto no WhatsApp.',
    hint: 'Catálogo visual na loja',
  },
  {
    id: 'servicos',
    label: 'Serviços',
    brand: 'Sua operação',
    line: 'Do pedido à OS — roadmap ERP no mesmo fio.',
    hint: 'Base para OS + ERP',
  },
] as const;

const FLOW = ['Escolha no totem', 'Confirme o interesse', 'Lead no WhatsApp'] as const;

export function HomePage() {
  const [activePlan, setActivePlan] = useState<(typeof PLANS)[number]['id']>('growth');
  const [spotlight, setSpotlight] = useState(0);
  const [segmentId, setSegmentId] = useState<(typeof SEGMENTS)[number]['id']>('celulares');
  const [flowStep, setFlowStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSpotlight((current) => (current + 1) % PRODUCTS.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFlowStep((current) => (current + 1) % FLOW.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  const selected = PLANS.find((plan) => plan.id === activePlan) ?? PLANS[1];
  const segment = SEGMENTS.find((item) => item.id === segmentId) ?? SEGMENTS[0];

  return (
    <div className="site">
      <div className="site__glow" aria-hidden="true" />
      <div className="site__grain" aria-hidden="true" />

      <header className="site__nav">
        <a href="#topo" className="site__nav-brand" aria-label="Marthi Tecnologia">
          <BrandLogo variant="mark" className="site__nav-mark" />
          <span>Marthi</span>
        </a>
        <nav className="site__nav-links">
          <a href="#quem-somos">Quem somos</a>
          <a href="#produtos">Produtos</a>
          <a href="#planos">Planos</a>
          <Link to="/totem">Demo totem</Link>
          <Link to="/login" className="site__nav-cta">
            Entrar
          </Link>
        </nav>
      </header>

      <main id="topo">
        <section className="hero">
          <div className="hero__copy">
            <BrandLogo variant="hero" className="hero__logo" />
            <h1>Totem de autoatendimento para qualquer segmento</h1>
            <p>
              A Marthi entrega a experiência na loja — e o login da operação fica com quem vende.
              Nesta demo, o tenant é a <strong>Cell Ponto</strong>. O roadmap une OS e ERP ao totem.
            </p>
            <div className="hero__segments" role="tablist" aria-label="Segmentos">
              {SEGMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={segmentId === item.id}
                  className={`hero__segment ${segmentId === item.id ? 'is-active' : ''}`}
                  onClick={() => setSegmentId(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="hero__segment-hint">{segment.hint}</p>
            <div className="hero__actions">
              <Link to="/login" className="btn btn--primary">
                Entrar na loja
              </Link>
              <Link to="/totem" className="btn btn--ghost">
                Abrir totem Cell Ponto
              </Link>
            </div>
          </div>

          <div className="hero__stage">
            <div className="hero__totem" aria-hidden="true">
              <div className="hero__totem-screen" key={segment.id}>
                <span className="hero__totem-brand">{segment.brand}</span>
                <strong>{segment.line}</strong>
                <div className="hero__totem-rail">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
            <ol className="hero__flow" aria-label="Fluxo do totem">
              {FLOW.map((step, index) => (
                <li key={step} className={flowStep === index ? 'is-active' : ''}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="hero__orbit hero__orbit--a" aria-hidden="true" />
            <div className="hero__orbit hero__orbit--b" aria-hidden="true" />
          </div>
        </section>

        <section id="quem-somos" className="section section--about">
          <div className="section__head">
            <p className="eyebrow">Quem somos</p>
            <h2>Software de loja física, pensado para crescer com você</h2>
          </div>
          <div className="about__grid">
            <article>
              <h3>Marthi Tecnologia</h3>
              <p>
                Criamos a camada de autoatendimento e operação para negócios presenciais — celular,
                ótica, moda, serviços. O totem captura intenção; o painel conduz a venda.
              </p>
            </article>
            <article>
              <h3>Cell Ponto nesta demo</h3>
              <p>
                Exemplo real de segmento: loja de celulares. O cliente usa o totem; a equipe entra
                com o login da loja. A marca do tenant aparece na operação — a plataforma é Marthi.
              </p>
            </article>
            <article>
              <h3>Para onde vamos</h3>
              <p>
                Ordem de serviço, estoque e ERP online no mesmo ecossistema, interligados ao totem —
                do lead à entrega sem mudar de sistema.
              </p>
            </article>
          </div>
        </section>

        <section id="produtos" className="section section--products">
          <div className="section__head">
            <p className="eyebrow">Nossos produtos</p>
            <h2>Uma plataforma. Vários módulos.</h2>
          </div>

          <div className="products">
            <div className="products__spotlight">
              {PRODUCTS.map((product, index) => (
                <button
                  key={product.title}
                  type="button"
                  className={`products__tab ${spotlight === index ? 'is-active' : ''}`}
                  onClick={() => setSpotlight(index)}
                >
                  {product.title}
                </button>
              ))}
            </div>

            <div className="products__panel" key={PRODUCTS[spotlight].title}>
              <h3>{PRODUCTS[spotlight].title}</h3>
              <p>{PRODUCTS[spotlight].text}</p>
              {PRODUCTS[spotlight].href.startsWith('#') ? (
                <a href={PRODUCTS[spotlight].href} className="btn btn--primary">
                  {PRODUCTS[spotlight].cta}
                </a>
              ) : (
                <Link to={PRODUCTS[spotlight].href} className="btn btn--primary">
                  {PRODUCTS[spotlight].cta}
                </Link>
              )}
            </div>
          </div>
        </section>

        <section id="planos" className="section section--plans">
          <div className="section__head">
            <p className="eyebrow">Planos de contrato</p>
            <h2>Escolha o ritmo da sua operação</h2>
          </div>

          <div className="plans">
            {PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={`plan-card ${activePlan === plan.id ? 'is-active' : ''} ${'featured' in plan && plan.featured ? 'is-featured' : ''}`}
                onClick={() => setActivePlan(plan.id)}
              >
                {'featured' in plan && plan.featured ? <span className="plan-card__badge">Mais escolhido</span> : null}
                <h3>{plan.name}</h3>
                <p className="plan-card__price">
                  {plan.price}
                  <small>{plan.period}</small>
                </p>
                <p className="plan-card__blurb">{plan.blurb}</p>
              </button>
            ))}
          </div>

          <div className="plan-detail">
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.blurb}</p>
            </div>
            <ul>
              {selected.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link to="/login" className="btn btn--primary">
              Quero este plano
            </Link>
          </div>
        </section>

        <section className="section section--closing">
          <h2>Pronto para mostrar na loja</h2>
          <p>
            Entre com o login da operação ou abra o totem da Cell Ponto e percorra o fluxo até o
            WhatsApp.
          </p>
          <div className="hero__actions">
            <Link to="/login" className="btn btn--primary">
              Login da loja
            </Link>
            <Link to="/totem" className="btn btn--ghost">
              Totem Cell Ponto
            </Link>
          </div>
        </section>
      </main>

      <footer className="site__footer">
        <BrandLogo variant="mark" className="site__footer-mark" />
        <div>
          <strong>Marthi Tecnologia</strong>
          <span>Totem · Painel · Roadmap OS/ERP</span>
        </div>
        <a href="https://marthi-totem.discloud.app" className="site__footer-link">
          marthi-totem.discloud.app
        </a>
      </footer>
    </div>
  );
}
