import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { PLANS } from '../data/catalog';
import './home.css';

const PRODUCTS = [
  {
    title: 'Totem de autoatendimento',
    text: 'Touch grande, fluxo guiado e lead no WhatsApp da loja — em qualquer segmento.',
    href: '/totem',
    cta: 'Abrir demo do totem',
  },
  {
    title: 'Painel da loja',
    text: 'Login da Sua Loja, catálogo e o que o cliente escolheu no totem.',
    href: '/login',
    cta: 'Entrar no painel',
  },
  {
    title: 'OS + ERP',
    text: 'Ordem de serviço e gestão no mesmo fio do totem — roadmap.',
    href: '/parceiro',
    cta: 'Quero ser parceiro',
  },
] as const;

const WHATSAPP_HREF = 'https://wa.me/5524981244253';
const INSTAGRAM_HREF = 'https://instagram.com/marthi.tecnologia';

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" className="brand-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" className="brand-ico" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM17.5 6a1 1 0 110 2 1 1 0 010-2z"
      />
    </svg>
  );
}

function IconLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="icon-label">
      {icon}
      {children}
    </span>
  );
}

export function HomePage() {
  const [activePlan, setActivePlan] = useState<(typeof PLANS)[number]['id']>('growth');
  const [spotlight, setSpotlight] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSpotlight((current) => (current + 1) % PRODUCTS.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setHelpOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  const selected = PLANS.find((plan) => plan.id === activePlan) ?? PLANS[1];

  return (
    <div className={`site ${helpOpen ? 'is-frosted' : ''}`}>
      <div className="site__glow" aria-hidden="true" />

      <header className="site__nav">
        <a href="#topo" className="site__nav-brand" aria-label="Marthi Tecnologia">
          <BrandLogo variant="mark" className="site__nav-mark" />
          <span>Marthi Tecnologia</span>
        </a>
        <nav className="site__nav-links">
          <a href="#produtos">Produtos</a>
          <a href="#planos">Planos</a>
          <button type="button" className="site__nav-link" onClick={() => setHelpOpen(true)}>
            Contato
          </button>
          <Link to="/totem">Demo</Link>
          <Link to="/login">Entrar</Link>
          <Link to="/parceiro" className="site__nav-cta">
            Solicitar demonstração
          </Link>
        </nav>
      </header>

      {helpOpen ? (
        <div className="site-help" role="dialog" aria-labelledby="site-help-title">
          <button
            type="button"
            className="site-help__backdrop"
            aria-label="Fechar contato"
            onClick={() => setHelpOpen(false)}
          />
          <div className="site-help__panel">
            <button type="button" className="site-help__close" onClick={() => setHelpOpen(false)} aria-label="Fechar">
              ×
            </button>
            <div className="site-help__faces" aria-hidden="true">
              <img src="/home/mulher-app.jpg" alt="" />
              <img src="/home/equipe.jpg" alt="" />
            </div>
            <h2 id="site-help-title">Estamos aqui para ajudar.</h2>
            <div className="site-help__block">
              <strong>Fale com a Marthi</strong>
              <p>Totem, painel ou cadastro de parceiro.</p>
              <a href={WHATSAPP_HREF} className="btn btn--whatsapp" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconWhatsApp />}>WhatsApp (24) 98124-4253</IconLabel>
              </a>
            </div>
            <div className="site-help__block">
              <strong>Instagram</strong>
              <a href={INSTAGRAM_HREF} className="btn btn--ghost" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconInstagram />}>@marthi.tecnologia</IconLabel>
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <main id="topo">
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Marthi Tecnologia</p>
            <h1>Sistemas na sua mão. A gestão que você precisa.</h1>
            <p>
              Totem na loja, painel da operação e o próximo passo do ERP — com a marca da
              <strong> Sua Loja</strong>.
            </p>
            <div className="hero__actions">
              <Link to="/parceiro" className="btn btn--primary">
                Ver soluções
              </Link>
              <Link to="/totem" className="btn btn--ghost">
                Abrir demo do totem
              </Link>
            </div>
          </div>
          <figure className="hero__photo">
            <img src="/home/mulher-app.jpg" alt="Cliente usando o sistema no celular" />
          </figure>
        </section>

        <section className="split" aria-labelledby="split-title">
          <figure className="split__photo">
            <img src="/home/equipe.jpg" alt="Equipe da loja colaborando no painel" />
          </figure>
          <div className="split__copy">
            <p className="eyebrow">Na operação</p>
            <h2 id="split-title">Sistemas que colaboram. Equipes que produzem.</h2>
            <p>
              O cliente escolhe no totem. A loja vê o interesse no painel e responde no WhatsApp.
            </p>
            <Link to="/login" className="btn btn--primary">
              Explorar o painel
            </Link>
          </div>
        </section>

        <section id="produtos" className="section section--products">
          <div className="section__head">
            <p className="eyebrow">Produtos</p>
            <h2>Uma plataforma. Três módulos.</h2>
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
              <Link to={PRODUCTS[spotlight].href} className="btn btn--primary">
                {PRODUCTS[spotlight].cta}
              </Link>
            </div>
          </div>
        </section>

        <section id="planos" className="section section--plans">
          <div className="section__head">
            <p className="eyebrow">Planos</p>
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
              {selected.features.slice(0, 4).map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link to={`/parceiro?plano=${selected.id}`} className="btn btn--primary">
              Quero este plano
            </Link>
          </div>
        </section>

        <section id="contato" className="section contact">
          <div className="section__head">
            <p className="eyebrow">Contato</p>
            <h2>Estamos aqui para ajudar.</h2>
          </div>
          <div className="contact__grid">
            <article>
              <p className="contact__kicker">
                <IconLabel icon={<IconWhatsApp />}>WhatsApp</IconLabel>
              </p>
              <h3>Fale com a Marthi</h3>
              <a href={WHATSAPP_HREF} className="btn btn--whatsapp" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconWhatsApp />}>Conversar · (24) 98124-4253</IconLabel>
              </a>
            </article>
            <article>
              <p className="contact__kicker">
                <IconLabel icon={<IconInstagram />}>Instagram</IconLabel>
              </p>
              <h3>@marthi.tecnologia</h3>
              <a href={INSTAGRAM_HREF} className="btn btn--ghost" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconInstagram />}>Abrir Instagram</IconLabel>
              </a>
            </article>
          </div>
        </section>
      </main>

      <footer className="site__footer">
        <div className="site__footer-brand">
          <BrandLogo variant="mark" className="site__footer-mark" />
          <div>
            <strong>Marthi Tecnologia</strong>
            <span>Totem, painel e o próximo passo do ERP.</span>
          </div>
        </div>
        <nav className="site__footer-links" aria-label="Links rápidos">
          <a href="#produtos">Produtos</a>
          <a href="#planos">Planos</a>
          <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer">
            <IconLabel icon={<IconWhatsApp />}>WhatsApp</IconLabel>
          </a>
          <a href={INSTAGRAM_HREF} target="_blank" rel="noreferrer">
            <IconLabel icon={<IconInstagram />}>Instagram</IconLabel>
          </a>
        </nav>
      </footer>
    </div>
  );
}
