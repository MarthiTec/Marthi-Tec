import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { DemoLeadGate } from '../components/DemoLeadGate';
import { useAuth } from '../contexts/AuthContext';
import {
  MARTHI_PRODUCTS,
  MARTHI_SEGMENTS,
  type MarthiProduct,
  type MarthiProductId,
} from '../data/marthiProducts';
import { isStoreContracted } from '../data/demoLeadStore';
import { MARTHI_COMPANY, marthiWhatsAppHref } from '../data/companyContact';
import { ingestContactLeadToCrm } from '../data/crmStore';
import { hasModule } from '../data/storePlan';
import './home.css';
import './products.css';

const WHATSAPP_HREF = MARTHI_COMPANY.whatsappHref;
const INSTAGRAM_HREF = MARTHI_COMPANY.instagramHref;

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

function IconLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="icon-label">
      {icon}
      {children}
    </span>
  );
}

function productUnlocked(product: MarthiProduct, contracted: boolean) {
  if (!contracted) return false;
  if (product.id === 'totem') return hasModule('totem');
  if (product.id === 'pdv' || product.id === 'erp' || product.id === 'painel') return hasModule('erp');
  if (product.id === 'os') return hasModule('os');
  if (product.id === 'fiscal') return hasModule('fiscal');
  if (product.id === 'ecommerce') return hasModule('ecommerce');
  if (product.id === 'crm') return true;
  return false;
}

export function ProductsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contracted, setContracted] = useState(() => isStoreContracted());
  const [activeId, setActiveId] = useState(MARTHI_PRODUCTS[0]?.id ?? 'totem');
  const [demoGate, setDemoGate] = useState<{ product: 'totem' | 'caixa' | 'os'; to: string } | null>(
    null,
  );
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactFeedback, setContactFeedback] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const navBtnRefs = useRef<Partial<Record<MarthiProductId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    function refresh() {
      setContracted(isStoreContracted());
    }
    window.addEventListener('marthi-plan-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('marthi-plan-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (user) setContracted(true);
  }, [user]);

  const active = MARTHI_PRODUCTS.find((item) => item.id === activeId) ?? MARTHI_PRODUCTS[0];
  const activeIndex = MARTHI_PRODUCTS.findIndex((item) => item.id === activeId);
  const isEdgeFirst = activeIndex <= 0;
  const isEdgeLast = activeIndex === MARTHI_PRODUCTS.length - 1;

  useLayoutEffect(() => {
    function updateBridge() {
      const layout = layoutRef.current;
      const btn = navBtnRefs.current[activeId];
      const detail = detailRef.current;
      if (!layout || !btn || !detail) return;

      if (window.matchMedia('(max-width: 960px)').matches) {
        layout.style.removeProperty('--bridge-gap');
        detail.style.removeProperty('--bridge-top');
        detail.style.removeProperty('--bridge-height');
        return;
      }

      const br = btn.getBoundingClientRect();
      const dr = detail.getBoundingClientRect();
      const gap = Math.max(0, dr.left - br.right);
      layout.style.setProperty('--bridge-gap', `${gap}px`);
      detail.style.setProperty('--bridge-top', `${Math.max(0, br.top - dr.top)}px`);
      detail.style.setProperty('--bridge-height', `${br.height}px`);
    }

    updateBridge();
    window.addEventListener('resize', updateBridge);
    window.addEventListener('scroll', updateBridge, true);
    return () => {
      window.removeEventListener('resize', updateBridge);
      window.removeEventListener('scroll', updateBridge, true);
    };
  }, [activeId]);

  function openProduct(product: MarthiProduct) {
    if (!product.href) return;
    if (product.demo && !productUnlocked(product, contracted)) {
      setDemoGate({ product: product.demo, to: product.href });
      return;
    }
    const needsLogin =
      product.href === '/caixa' ||
      product.href === '/os' ||
      product.href === '/erp' ||
      product.href === '/fiscal' ||
      product.href === '/ecommerce' ||
      product.href === '/crm' ||
      product.href === '/painel';
    if (needsLogin && !user && product.href !== '/totem') {
      navigate(`/login?next=${encodeURIComponent(product.href)}`);
      return;
    }
    navigate(product.href);
  }

  async function submitInterest(event: FormEvent) {
    event.preventDefault();
    const result = await ingestContactLeadToCrm({
      name: contactName,
      whatsapp: contactPhone,
      message: `Interesse em produtos Marthi · foco: ${active.name}`,
    });
    if (!result.ok) {
      setContactFeedback(result.error);
      return;
    }
    const text = [
      'Olá Marthi! Quero saber mais sobre os produtos.',
      '',
      `Nome: ${contactName.trim()}`,
      `WhatsApp: ${contactPhone.trim()}`,
      `Produto de interesse: ${active.name}`,
    ].join('\n');
    setContactFeedback('Recebido! Abrindo WhatsApp…');
    window.open(marthiWhatsAppHref(text), '_blank', 'noopener,noreferrer');
    setContactName('');
    setContactPhone('');
  }

  return (
    <div className="site products-page">
      <div className="site__glow" aria-hidden="true" />

      <header className="site__nav">
        <Link to="/" className="site__nav-brand site__nav-brand--lockup" aria-label="Marthi Tecnologia">
          <BrandLogo variant="lockup" className="site__nav-lockup" />
        </Link>
        <nav className={`site__nav-links ${navOpen ? 'is-open' : ''}`}>
          <Link to="/produtos" aria-current="page" onClick={() => setNavOpen(false)}>
            Produtos
          </Link>
          <Link to="/#planos" onClick={() => setNavOpen(false)}>
            Planos
          </Link>
          <Link to="/#sobre" onClick={() => setNavOpen(false)}>
            Sobre nós
          </Link>
          <a href={WHATSAPP_HREF} target="_blank" rel="noreferrer" onClick={() => setNavOpen(false)}>
            Contato
          </a>
          <Link to="/parceiro" className="site__nav-cta" onClick={() => setNavOpen(false)}>
            Solicitar demo
          </Link>
          <Link
            to="/login"
            className="site__nav-login site__nav-login--mobile"
            onClick={() => setNavOpen(false)}
          >
            Entrar
          </Link>
        </nav>
        <div className="site__nav-end">
          <Link to="/login" className="site__nav-login site__nav-login--desk" onClick={() => setNavOpen(false)}>
            Entrar
          </Link>
          <button
            type="button"
            className="site__nav-burger"
            aria-expanded={navOpen}
            aria-label="Abrir menu"
            onClick={() => setNavOpen((open) => !open)}
          >
            <i />
            <i />
            <i />
          </button>
        </div>
      </header>

      <main>
        <section className="products-hero">
          <div className="products-hero__copy">
            <p className="eyebrow">Nossos produtos</p>
            <h1>Tudo que a Marthi atende — da vitrine ao fiscal.</h1>
            <p>
              Totem, caixa, OS, ERP, emissor fiscal, e-commerce e CRM. Escolha os módulos do seu
              plano e opere a loja em um só ecossistema.
            </p>
            <div className="products-hero__actions">
              <a href="#catalogo" className="btn btn--primary btn--with-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
                  />
                </svg>
                Explorar catálogo
              </a>
              <Link to="/parceiro" className="btn btn--ghost btn--with-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 2v2H5V6h14zM5 18v-8h14v8H5zm2-2h4v-1.5H7V16zm6 0h4v-1.5h-4V16zM7 12.5h10V11H7v1.5z"
                  />
                </svg>
                Montar meu plano
              </Link>
            </div>
          </div>
          <div className="products-hero__visual" aria-hidden="true">
            <img src="/home/equipe.jpg" alt="" />
            <div className="products-hero__veil" />
          </div>
        </section>

        <section className="section products-segments" aria-labelledby="segments-title">
          <div className="section__head">
            <p className="eyebrow">Para quem</p>
            <h2 id="segments-title">Segmentos que atendemos</h2>
          </div>
          <div className="products-segments__grid">
            {MARTHI_SEGMENTS.map((segment) => (
              <article key={segment.id}>
                <h3>{segment.name}</h3>
                <p>{segment.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="catalogo" className="section products-catalog">
          <div className="section__head">
            <p className="eyebrow">Catálogo</p>
            <h2>Oito soluções. Uma plataforma.</h2>
          </div>

          <div
            className={[
              'products-catalog__layout',
              isEdgeFirst ? 'is-edge-first' : '',
              isEdgeLast ? 'is-edge-last' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            ref={layoutRef}
            style={{ ['--product-accent' as string]: active.accent }}
          >
            <nav className="products-catalog__nav" aria-label="Lista de produtos">
              {MARTHI_PRODUCTS.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  ref={(node) => {
                    navBtnRefs.current[product.id] = node;
                  }}
                  className={activeId === product.id ? 'is-active' : undefined}
                  style={
                    activeId === product.id
                      ? {
                          borderColor: product.accent,
                          borderRight: 'none',
                          color: product.accent,
                        }
                      : undefined
                  }
                  onClick={() => setActiveId(product.id)}
                >
                  <strong>{product.name}</strong>
                  <span>{product.tagline}</span>
                </button>
              ))}
            </nav>

            <article ref={detailRef} className="products-catalog__detail">
              <p className="products-catalog__tag" style={{ color: active.accent }}>
                {active.tagline}
              </p>
              <h3>{active.name}</h3>
              <p className="products-catalog__summary">{active.summary}</p>
              <p className="products-catalog__audience">
                <strong>Para quem:</strong> {active.audience}
              </p>
              <ul>
                {active.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className="products-catalog__cta">
                <button
                  type="button"
                  className="btn btn--primary btn--with-icon"
                  onClick={() => openProduct(active)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
                    />
                  </svg>
                  {active.cta ?? 'Abrir módulo'}
                </button>
                <Link to="/parceiro" className="btn btn--ghost btn--with-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
                    />
                  </svg>
                  Incluir no plano
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="section products-grid-section">
          <div className="section__head">
            <p className="eyebrow">Visão rápida</p>
            <h2>Todos os produtos</h2>
          </div>
          <div className="products-grid">
            {MARTHI_PRODUCTS.map((product) => (
              <button
                key={product.id}
                type="button"
                className="products-grid__card"
                onClick={() => {
                  setActiveId(product.id);
                  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span className="products-grid__dot" style={{ background: product.accent }} />
                <strong>{product.name}</strong>
                <span>{product.tagline}</span>
                <p>{product.summary}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="section products-interest">
          <div className="products-interest__card">
            <div>
              <p className="eyebrow">Próximo passo</p>
              <h2>Quer ver na prática?</h2>
              <p>
                Deixe seu WhatsApp ou fale direto conosco. Um consultor Marthi monta a demo com os
                módulos certos para a sua loja.
              </p>
            </div>
            <form onSubmit={submitInterest}>
              <label>
                Nome
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                />
              </label>
              <label>
                WhatsApp
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn btn--whatsapp">
                <IconLabel icon={<IconWhatsApp />}>Falar no WhatsApp</IconLabel>
              </button>
              {contactFeedback ? <p className="products-interest__ok">{contactFeedback}</p> : null}
            </form>
          </div>
        </section>
      </main>

      <footer className="site__footer">
        <div className="site__footer-brand">
          <BrandLogo variant="lockup" className="site__footer-lockup" />
          <div>
            <strong>{MARTHI_COMPANY.legalName}</strong>
            <span>{MARTHI_COMPANY.addressLine}</span>
            <a href={MARTHI_COMPANY.emailHref}>{MARTHI_COMPANY.email}</a>
          </div>
        </div>
        <nav className="site__footer-links" aria-label="Links rápidos">
          <Link to="/">Home</Link>
          <Link to="/produtos">Produtos</Link>
          <Link to="/parceiro">Solicitar demo</Link>
          <a href={INSTAGRAM_HREF} target="_blank" rel="noreferrer">
            Instagram
          </a>
        </nav>
      </footer>

      {demoGate ? (
        <DemoLeadGate
          product={demoGate.product}
          to={demoGate.to}
          open
          onClose={() => setDemoGate(null)}
        />
      ) : null}
    </div>
  );
}
