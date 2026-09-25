import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { DemoLeadGate } from '../components/DemoLeadGate';
import { useAuth } from '../contexts/AuthContext';
import {
  MARTHI_PRODUCTS,
  MARTHI_SEGMENTS,
  type MarthiProduct,
  type MarthiProductId,
} from '../data/marthiProducts';
import { isStoreContracted } from '../data/demoLeadStore';
import { marthiWhatsAppHref } from '../data/companyContact';
import { ingestContactLeadToCrm } from '../data/crmStore';
import { hasModule } from '../data/storePlan';
import './home.css';
import './products.css';

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
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

type ProductCategory = 'all' | 'loja' | 'oficina' | 'gestao' | 'fiscal-ecom';

const CATEGORY_FILTERS: Array<{ id: ProductCategory; label: string }> = [
  { id: 'all', label: 'Todos os Módulos' },
  { id: 'loja', label: 'Frente de Loja & Balcão' },
  { id: 'oficina', label: 'Oficina & Serviços' },
  { id: 'gestao', label: 'Retaguarda & Gestão' },
  { id: 'fiscal-ecom', label: 'Fiscal & Canais Online' },
];

export function ProductsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contracted, setContracted] = useState(() => isStoreContracted());
  const [activeId, setActiveId] = useState<MarthiProductId>(MARTHI_PRODUCTS[0]?.id ?? 'totem');
  const [category, setCategory] = useState<ProductCategory>('all');
  const [demoGate, setDemoGate] = useState<{ product: 'totem' | 'caixa' | 'os'; to: string } | null>(
    null,
  );
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactFeedback, setContactFeedback] = useState('');

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
    setContactFeedback('');
    const result = await ingestContactLeadToCrm({
      name: contactName,
      whatsapp: contactPhone,
      message: `Interesse enviado na página de produtos: ${active.name}`,
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

  // Filter products for the quick grid
  const filteredProducts = MARTHI_PRODUCTS.filter((product) => {
    if (category === 'all') return true;
    if (category === 'loja') return product.id === 'totem' || product.id === 'pdv';
    if (category === 'oficina') return product.id === 'os';
    if (category === 'gestao') return product.id === 'erp' || product.id === 'painel';
    if (category === 'fiscal-ecom')
      return product.id === 'fiscal' || product.id === 'ecommerce' || product.id === 'crm';
    return true;
  });

  return (
    <div className="site products-page">
      <div className="site__glow" aria-hidden="true" />

      {/* Unified Public Header */}
      <PublicHeader />

      <main>
        {/* Hero Section with fixed overflow-clip and non-blocking background */}
        <section className="products-hero">
          <div className="products-hero__copy">
            <p className="eyebrow">Catálogo Marthi</p>
            <h1>Tudo que a sua loja precisa — da vitrine ao fiscal.</h1>
            <p>
              Totem touch de autoatendimento, PDV veloz, ordem de serviço para oficina, Retaguarda
              completa, emissor fiscal e sincronização com marketplaces. Um único ecossistema integrado.
            </p>
            <div className="products-hero__actions">
              <a href="#catalogo" className="btn btn--primary btn--with-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
                  />
                </svg>
                Explorar Catálogo
              </a>
              <Link to="/planos" className="btn btn--ghost btn--with-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 2v2H5V6h14zM5 18v-8h14v8H5zm2-2h4v-1.5H7V16zm6 0h4v-1.5h-4V16zM7 12.5h10V11H7v1.5z"
                  />
                </svg>
                Ver Planos & Preços
              </Link>
            </div>
          </div>
          <div className="products-hero__visual" aria-hidden="true">
            <img src="/home/equipe.jpg" alt="" loading="eager" />
            <div className="products-hero__veil" />
          </div>
        </section>

        {/* Segmentos Atendidos */}
        <section className="section products-segments" aria-labelledby="segments-title">
          <div className="section__head">
            <p className="eyebrow">Soluções por Ramo</p>
            <h2 id="segments-title">Projetado para o seu modelo de negócio</h2>
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

        {/* Seletor & Detalhe dos Produtos */}
        <section id="catalogo" className="section products-catalog">
          <div className="section__head">
            <p className="eyebrow">Ecossistema Integrado</p>
            <h2>Oito módulos. Uma experiência completa.</h2>
            <p style={{ margin: '8px auto 0', maxWidth: '48ch', color: '#64748b' }}>
              Clique em cada solução para conferir as funcionalidades detalhadas, abrir a demonstração ou
              adicionar ao seu plano.
            </p>
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
                <strong>Para quem é ideal:</strong> {active.audience}
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
                <Link to="/planos" className="btn btn--ghost btn--with-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                  Ver nos Planos
                </Link>
                <a
                  href={marthiWhatsAppHref(`Olá! Gostaria de tirar dúvidas sobre o produto: ${active.name}.`)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn--ghost btn--with-icon"
                >
                  <IconWhatsApp />
                  Dúvidas no WhatsApp
                </a>
              </div>
            </article>
          </div>
        </section>

        {/* Visão Rápida com Filtro de Categorias */}
        <section className="section products-grid-section">
          <div className="section__head">
            <p className="eyebrow">Exploração Rápida</p>
            <h2>Filtre por Área de Atuação</h2>
          </div>

          <div className="products-filter-bar" role="tablist">
            {CATEGORY_FILTERS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`products-filter-pill ${category === cat.id ? 'is-active' : ''}`}
                onClick={() => setCategory(cat.id)}
                role="tab"
                aria-selected={category === cat.id}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="products-grid">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="products-grid__card"
                onClick={() => {
                  setActiveId(product.id);
                  document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span
                  className="products-grid__badge"
                  style={{
                    background: `${product.accent}18`,
                    color: product.accent,
                  }}
                >
                  {product.tagline}
                </span>
                <span className="products-grid__dot" style={{ background: product.accent }} />
                <strong>{product.name}</strong>
                <p>{product.summary}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Próximo Passo & Formulário */}
        <section className="section products-interest">
          <div className="products-interest__card">
            <div>
              <p className="eyebrow">Demonstração Assistida</p>
              <h2>Quer ver funcionando na prática?</h2>
              <p>
                Deixe seu contato ou chame no WhatsApp. Um especialista Marthi monta uma demonstração
                completa personalizada com a realidade do seu ramo.
              </p>
            </div>
            <form onSubmit={submitInterest}>
              <label>
                Seu Nome
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
              </label>
              <label>
                WhatsApp com DDD
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="(24) 98124-4253"
                  required
                />
              </label>
              <button type="submit" className="btn btn--whatsapp">
                <IconWhatsApp />
                <span>Solicitar Contato no WhatsApp</span>
              </button>
              {contactFeedback ? <p className="products-interest__ok">{contactFeedback}</p> : null}
            </form>
          </div>
        </section>
      </main>

      {/* Unified Public Footer */}
      <PublicFooter />

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
