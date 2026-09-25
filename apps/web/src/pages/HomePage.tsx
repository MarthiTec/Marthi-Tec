import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { DemoLeadGate } from '../components/DemoLeadGate';
import { useAuth } from '../contexts/AuthContext';
import { PLANS, type PlanId } from '../data/catalog';
import { getCommercialPlans, PLANS_UPDATED_EVENT, type CommercialPlan } from '../data/plansStore';
import { MARTHI_PRODUCTS } from '../data/marthiProducts';
import {
  enableLivePresentation,
  hasDemoAccess,
  isStoreContracted,
} from '../data/demoLeadStore';
import {
  MARTHI_COMPANY,
  marthiWhatsAppHref,
} from '../data/companyContact';
import { ingestSellerApplicantToCrm, listLeadMessages, postHomepageCrmChat } from '../data/crmStore';
import { hasModule } from '../data/storePlan';
import { useStoreCustomization } from '../data/storeSegment';
import './home.css';
import './products.css';

const WHATSAPP_HREF = MARTHI_COMPANY.whatsappHref;
const INSTAGRAM_HREF = MARTHI_COMPANY.instagramHref;

const HOME_PRODUCT_IDS = ['totem', 'pdv', 'os', 'fiscal', 'ecommerce', 'crm', 'erp', 'painel'] as const;

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
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlan[]>(() => getCommercialPlans());
  const [activePlan, setActivePlan] = useState<PlanId>('silver');
  const [helpOpen, setHelpOpen] = useState(false);
  const [contracted, setContracted] = useState(() => isStoreContracted());
  const [demoGate, setDemoGate] = useState<{ product: 'totem' | 'caixa' | 'os'; to: string } | null>(
    null,
  );
  const [liveReady, setLiveReady] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMsg, setContactMsg] = useState('');
  const [contactFeedback, setContactFeedback] = useState('');
  const [guestLeadId, setGuestLeadId] = useState<string | null>(null);
  const [guestThread, setGuestThread] = useState<
    Array<{ id: string; fromName: string; text: string; fromLead?: boolean; createdAt: string }>
  >([]);
  const [jobName, setJobName] = useState('');
  const [jobPhone, setJobPhone] = useState('');
  const [jobCity, setJobCity] = useState('');
  const [jobExp, setJobExp] = useState('');
  const [jobFeedback, setJobFeedback] = useState('');

  const [showcase, setShowcase] = useState<'pdv' | 'erp' | 'painel' | 'os'>('erp');

  const showcaseImage =
    showcase === 'pdv'
      ? '/home/showcase-pdv.jpg'
      : showcase === 'erp'
        ? '/home/showcase-erp.jpg'
        : showcase === 'painel'
          ? '/home/showcase-painel.jpg'
          : '/home/showcase-os.jpg';

  const showcaseCaption =
    showcase === 'pdv'
      ? 'PDV · Caixa na loja'
      : showcase === 'erp'
        ? 'Marthi · Retaguarda da loja'
        : showcase === 'painel'
          ? 'Painel da operação · KPIs e gráficos'
          : 'Marthi OS · Quadro da oficina';

  const showCaixa = contracted && hasModule('erp');
  const showTotem = contracted && hasModule('totem');
  const showOs = contracted && hasModule('os');
  const showFiscal = contracted && hasModule('fiscal');
  const storeCustom = useStoreCustomization();
  /** Em apresentação ao vivo, abre módulos direto (sem pedir login). */
  const liveOpen =
    liveReady || hasDemoAccess('totem') || hasDemoAccess('caixa') || hasDemoAccess('os');
  const caixaHref = user || liveOpen ? '/caixa' : '/login?next=/caixa';
  const osHref = user || liveOpen ? '/os' : '/login?next=/os';
  const fiscalHref = user || liveOpen ? '/fiscal' : '/login?next=/fiscal';

  const homeProducts = HOME_PRODUCT_IDS.map(
    (id) => MARTHI_PRODUCTS.find((item) => item.id === id)!,
  ).filter(Boolean);

  useEffect(() => {
    function refresh() {
      setContracted(isStoreContracted());
    }
    function refreshPlans() {
      setCommercialPlans(getCommercialPlans());
    }
    window.addEventListener('marthi-plan-updated', refresh);
    window.addEventListener(PLANS_UPDATED_EVENT, refreshPlans);
    window.addEventListener('storage', refresh);
    window.addEventListener('storage', refreshPlans);
    return () => {
      window.removeEventListener('marthi-plan-updated', refresh);
      window.removeEventListener(PLANS_UPDATED_EVENT, refreshPlans);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('storage', refreshPlans);
    };
  }, []);

  useEffect(() => {
    if (user) setContracted(true);
  }, [user]);

  useEffect(() => {
    const live = searchParams.get('live');
    if (live === '1' || live === 'totem') {
      enableLivePresentation();
      setContracted(true);
      setLiveReady(true);
      const next = new URLSearchParams(searchParams);
      next.delete('live');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!helpOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setHelpOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  const selected = commercialPlans.find((plan) => plan.id === activePlan) ?? commercialPlans[0] ?? PLANS[1];

  function openDemo(product: 'totem' | 'caixa' | 'os', to: string) {
    setDemoGate({ product, to });
  }

  return (
    <div className={`site ${helpOpen ? 'is-frosted' : ''}`}>
      <div className="site__glow" aria-hidden="true" />

      <PublicHeader />

      {helpOpen ? (
        <div className="site-help" role="dialog" aria-labelledby="site-help-title">
          <button
            type="button"
            className="site-help__backdrop"
            aria-label="Fechar contato"
            onClick={() => setHelpOpen(false)}
          />
          <div className="site-help__panel">
            <button
              type="button"
              className="site-help__close"
              onClick={() => setHelpOpen(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <div className="site-help__faces" aria-hidden="true">
              <img src="/home/showcase-pdv.jpg" alt="" />
              <img src="/home/showcase-os.jpg" alt="" />
            </div>
            <h2 id="site-help-title">Estamos aqui para ajudar.</h2>
            <div className="site-help__block">
              <strong>Fale com a Marthi</strong>
              <p>
                Sede: {MARTHI_COMPANY.addressLine}. Totem, painel, CRM ou cadastro de parceiro.
              </p>
              <a href={WHATSAPP_HREF} className="btn btn--whatsapp" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconWhatsApp />}>
                  WhatsApp {MARTHI_COMPANY.whatsappDisplay}
                </IconLabel>
              </a>
              <a href={MARTHI_COMPANY.emailHref} className="btn btn--ghost">
                {MARTHI_COMPANY.email}
              </a>
            </div>
            <div className="site-help__block">
              <strong>Instagram</strong>
              <a href={INSTAGRAM_HREF} className="btn btn--ghost" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconInstagram />}>@{MARTHI_COMPANY.instagramHandle}</IconLabel>
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <main id="topo">
        {liveReady ? (
          <p className="site-live-banner" role="status">
            Modo apresentação ativo · Totem, PDV e OS liberados nesta sessão.
            <Link to="/totem">Abrir Totem agora</Link>
          </p>
        ) : null}

        <section className="hero">
          <div className="hero__media" aria-hidden="false">
            <img src="/home/showcase-pdv.jpg" alt="" />
            <div className="hero__veil" />
            <div className="hero__grain" aria-hidden />
          </div>
          <div className="hero__copy">
            <p className="hero__brand" aria-label="Marthi">
              Marthi
            </p>
            <h1>Tecnologia que coloca a loja no comando.</h1>
            <p>
              Totem, PDV, OS, fiscal e e-commerce no mesmo ritmo — feitos para o varejo brasileiro
              operar com clareza.
            </p>
            <div className="hero__actions">
              <Link to="/parceiro" className="btn btn--primary btn--hero">
                Solicitar demonstração
              </Link>
              <Link to="/produtos" className="btn btn--ghost hero__ghost">
                Ver produtos
              </Link>
            </div>
          </div>
        </section>

        <section id="totem" className="spotlight" aria-labelledby="spotlight-title">
          <div className="spotlight__inner">
            <div className="spotlight__copy">
              <p className="eyebrow">Produto em destaque</p>
              <h2 id="spotlight-title">Totem de autoatendimento</h2>
              <p>
                O cliente escolhe no touch, a loja recebe o interesse no WhatsApp e no painel.
                Ideal para varejo, assistência e showroom — sem fila no balcão.
              </p>
              <ul className="spotlight__list">
                <li>Catálogo touch com fotos e opções</li>
                <li>Lead automático no WhatsApp da loja</li>
                <li>Insights de conversão no painel</li>
                <li>Marca da loja personalizável</li>
              </ul>
              <div className="spotlight__actions">
                {showTotem ? (
                  <Link to="/totem" className="btn btn--primary">
                    Experimentar agora
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => openDemo('totem', '/totem')}
                  >
                    Ver demo do Totem
                  </button>
                )}
                <Link to="/parceiro" className="btn btn--ghost">
                  Falar com a Marthi
                </Link>
              </div>
            </div>
            <div className="spotlight__stage" aria-hidden="true">
              <div className="spotlight__glow" />
              <figure className="spotlight__device spotlight__device--back">
                <img src="/totem/iphone-15/2.svg" alt="" />
              </figure>
              <figure className="spotlight__device spotlight__device--mid">
                <img src="/totem/iphone-16-pro/1.svg" alt="" />
              </figure>
              <figure className="spotlight__device spotlight__device--front">
                <img src="/totem/iphone-16-pro-max/3.svg" alt="" />
              </figure>
              <p className="spotlight__caption">Catálogo touch · lead na hora · painel da loja</p>
            </div>
          </div>
        </section>

        <section className="journey" aria-labelledby="journey-title">
          <div className="journey__inner">
            <p className="eyebrow">Como funciona</p>
            <h2 id="journey-title">Da vitrine ao fechamento, sem fricção.</h2>
            <ol className="journey__steps">
              <li>
                <span className="journey__num">01</span>
                <strong>Cliente escolhe</strong>
                <p>Totem touch ou balcão — o mesmo catálogo, com fotos e opções reais.</p>
              </li>
              <li>
                <span className="journey__num">02</span>
                <strong>A loja recebe</strong>
                <p>WhatsApp, painel e PDV sincronizados com o interesse ou o pedido.</p>
              </li>
              <li>
                <span className="journey__num">03</span>
                <strong>Equipe opera</strong>
                <p>OS, fiscal e e-commerce no mesmo ecossistema — gestão com autoridade.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="telas" className="showcase" aria-labelledby="showcase-title">
          <div className="showcase__inner">
            <div className="showcase__copy">
              <p className="eyebrow">Por dentro do sistema</p>
              <h2 id="showcase-title">Retaguarda, painel e oficina — as telas reais da loja.</h2>
              <p>
                Retaguarda dark da Marthi, painel de operação e quadro da oficina. Troque as
                abas e veja o visual que a equipe usa no dia a dia.
              </p>
              <div className="showcase__tabs" role="tablist" aria-label="Telas do sistema">
                <button
                  type="button"
                  role="tab"
                  aria-selected={showcase === 'erp'}
                  className={showcase === 'erp' ? 'is-active' : ''}
                  onClick={() => setShowcase('erp')}
                >
                  Retaguarda
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showcase === 'painel'}
                  className={showcase === 'painel' ? 'is-active' : ''}
                  onClick={() => setShowcase('painel')}
                >
                  Painel
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showcase === 'pdv'}
                  className={showcase === 'pdv' ? 'is-active' : ''}
                  onClick={() => setShowcase('pdv')}
                >
                  PDV / Caixa
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={showcase === 'os'}
                  className={showcase === 'os' ? 'is-active' : ''}
                  onClick={() => setShowcase('os')}
                >
                  Oficina / OS
                </button>
              </div>
              <ul className="showcase__bullets">
                {showcase === 'erp' ? (
                  <>
                    <li>Retaguarda: estoque, clientes, financeiro e boletos</li>
                    <li>Cards de módulos com atalho direto para cada área</li>
                    <li>Alertas de estoque baixo e títulos em aberto</li>
                  </>
                ) : null}
                {showcase === 'painel' ? (
                  <>
                    <li>Fila do PDV, vendas, caixa e tesouraria em um só painel</li>
                    <li>Gráficos de rendimento, curva de receita e metas</li>
                    <li>Operações rápidas para a equipe no balcão</li>
                  </>
                ) : null}
                {showcase === 'pdv' ? (
                  <>
                    <li>Caixa livre com busca por SKU e estoque rápido</li>
                    <li>Pagamento, CPF na nota, desconto e acréscimo</li>
                    <li>Atalhos de teclado pensados para o balcão</li>
                  </>
                ) : null}
                {showcase === 'os' ? (
                  <>
                    <li>Quadro Kanban: aberta, diagnóstico, aguardando, em serviço, pronta</li>
                    <li>Resumo da oficina e atalhos de nova OS</li>
                    <li>Integração com estoque e caixa</li>
                  </>
                ) : null}
              </ul>
              <div className="showcase__actions">
                {showcase === 'erp' ? (
                  <Link to={user ? '/erp' : '/login?next=/erp'} className="btn btn--primary">
                    Abrir Retaguarda
                  </Link>
                ) : null}
                {showcase === 'painel' ? (
                  <Link to={user ? '/painel' : '/login?next=/painel'} className="btn btn--primary">
                    Abrir painel
                  </Link>
                ) : null}
                {showcase === 'pdv' ? (
                  showCaixa || liveOpen ? (
                    <Link to={caixaHref} className="btn btn--primary">
                      Abrir PDV
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => openDemo('caixa', '/caixa')}
                    >
                      Ver demo do PDV
                    </button>
                  )
                ) : null}
                {showcase === 'os' ? (
                  showOs || liveOpen ? (
                    <Link to={osHref} className="btn btn--primary">
                      Abrir OS
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => openDemo('os', '/os')}
                    >
                      Ver demo da OS
                    </button>
                  )
                ) : null}
                <Link to="/parceiro" className="btn btn--ghost">
                  Solicitar demonstração
                </Link>
              </div>
            </div>

            <div className="showcase__stage">
              <figure className="showcase__photo">
                <img src={showcaseImage} alt={showcaseCaption} />
              </figure>
              <p className="showcase__caption">{showcaseCaption}</p>
            </div>
          </div>
        </section>

        {(showCaixa || showTotem || showOs || showFiscal) && (
          <section className="section section--launch" aria-label="Acesso rápido">
            <div className="launch-row">
              {showTotem ? (
                <Link to="/totem" className="launch-card launch-card--accent">
                  <strong>Totem</strong>
                  <span>Abrir autoatendimento</span>
                </Link>
              ) : null}
              {showCaixa ? (
                <Link to={caixaHref} className="launch-card">
                  <strong>Caixa / PDV</strong>
                  <span>{user || liveOpen ? 'Abrir sistema de caixa' : 'Entrar e abrir o caixa'}</span>
                </Link>
              ) : null}
              {(showCaixa || showTotem) && storeCustom.showTablesAndKitchen ? (
                <Link to="/mesa" className="launch-card">
                  <strong>Mesas</strong>
                  <span>Garçom lança pedido no tablet</span>
                </Link>
              ) : null}
              {(showCaixa || showTotem) && storeCustom.showTablesAndKitchen ? (
                <Link to="/cozinha" className="launch-card">
                  <strong>Cozinha</strong>
                  <span>Fila ao vivo na TV da cozinha</span>
                </Link>
              ) : null}
              {showOs ? (
                <Link to={osHref} className="launch-card">
                  <strong>Ordem de serviço</strong>
                  <span>{user || liveOpen ? 'Abrir oficina' : 'Entrar e abrir a oficina'}</span>
                </Link>
              ) : null}
              {showFiscal ? (
                <Link to={fiscalHref} className="launch-card">
                  <strong>Emissor Fiscal</strong>
                  <span>
                    {user || liveOpen ? 'Abrir NF-e / NFS-e / CT-e / MDF-e' : 'Entrar e abrir o emissor'}
                  </span>
                </Link>
              ) : null}
            </div>
          </section>
        )}

        <section id="sobre" className="split" aria-labelledby="split-title">
          <figure className="split__photo">
            <img src="/home/showcase-painel.jpg" alt="Painel Marthi na operação da loja" />
          </figure>
          <div className="split__copy">
            <p className="eyebrow">Sobre nós</p>
            <h2 id="split-title">Construímos a operação completa da loja.</h2>
            <p>
              A Marthi une totem, PDV, OS, fiscal e e-commerce para o varejo vender e atender sem
              fricção entre canais — com painel, permissões e marca da loja.
            </p>
            <Link to="/produtos" className="btn btn--primary">
              Conhecer os produtos
            </Link>
          </div>
        </section>

        <section id="produtos" className="section home-products">
          <div className="section__head">
            <p className="eyebrow">Produtos</p>
            <h2>O que a Marthi entrega</h2>
          </div>
          <div className="home-products__grid">
            {homeProducts.map((product) => (
              <Link key={product.id} to="/produtos" className="home-products__card">
                <span
                  className="products-grid__dot"
                  style={{ background: product.accent }}
                  aria-hidden
                />
                <strong>{product.name}</strong>
                <span>{product.tagline}</span>
                <p>{product.summary}</p>
              </Link>
            ))}
          </div>
          <div className="home-products__more">
            <Link to="/produtos" className="btn btn--primary">
              Página completa de produtos
            </Link>
          </div>
        </section>

        <section id="planos" className="section section--plans">
          <div className="section__head">
            <p className="eyebrow">Planos</p>
            <h2>Escolha o ritmo da sua operação</h2>
            <p className="section__sub">
              O painel da loja entra em todo plano. Os módulos (Totem, OS, Retaguarda/PDV, Fiscal, E-commerce)
              você combina conforme o Bronze, Silver ou Golden.
            </p>
          </div>
          <div className="plans">
            {commercialPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={`plan-card plan-card--${plan.id} ${activePlan === plan.id ? 'is-active' : ''} ${plan.featured ? 'is-featured' : ''}`}
                onClick={() => setActivePlan(plan.id)}
              >
                {plan.featured ? (
                  <span className="plan-card__badge">{plan.commercialCallout || 'Mais escolhido'}</span>
                ) : null}
                <h3>{plan.name}</h3>
                <p className="plan-card__price">
                  {plan.promotionalPrice ? (
                    <>
                      <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.85em', marginRight: '6px' }}>
                        {plan.price}
                      </span>
                      <span>{plan.promotionalPrice}</span>
                    </>
                  ) : (
                    plan.price
                  )}
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
            <Link to={`/parceiro?plano=${selected.id}&passo=pagamento`} className="btn btn--primary">
              Contratar e pagar
            </Link>
          </div>
        </section>

        <section id="trabalhe-conosco" className="section careers">
          <div className="careers__layout">
            <div className="careers__copy">
              <p className="eyebrow">Carreira</p>
              <h2>Trabalhe conosco</h2>
              <p>
                Quer vender Marthi? Cadastre-se e fale com a gente no WhatsApp. Buscamos vendedores
                para atender lojas e levar totem, PDV, OS, fiscal e CRM ao mercado.
              </p>
              <ul className="careers__list">
                <li>Comissão por negócio fechado</li>
                <li>Perfil no CRM interno Marthi</li>
                <li>Leads da homepage e parceiros</li>
              </ul>
            </div>
            <form
              className="careers__form"
              onSubmit={async (event) => {
                event.preventDefault();
                const result = await ingestSellerApplicantToCrm({
                  name: jobName,
                  whatsapp: jobPhone,
                  city: jobCity,
                  experience: jobExp,
                });
                if (!result.ok) {
                  setJobFeedback(result.error);
                  return;
                }
                const text = [
                  'Olá Marthi! Quero trabalhar como vendedor.',
                  '',
                  `Nome: ${jobName.trim()}`,
                  `WhatsApp: ${jobPhone.trim()}`,
                  jobCity.trim() ? `Cidade: ${jobCity.trim()}` : '',
                  jobExp.trim() ? `Experiência: ${jobExp.trim()}` : '',
                ]
                  .filter(Boolean)
                  .join('\n');
                setJobFeedback('Abrindo WhatsApp… Candidatura também entrou no CRM.');
                  window.open(
                  marthiWhatsAppHref(text),
                  '_blank',
                  'noopener,noreferrer',
                );
                setJobName('');
                setJobPhone('');
                setJobCity('');
                setJobExp('');
              }}
            >
              <h3>Cadastro de vendedor</h3>
              <label>
                Nome completo
                <input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  required
                  placeholder="Seu nome"
                />
              </label>
              <label>
                Seu WhatsApp
                <input
                  value={jobPhone}
                  onChange={(e) => setJobPhone(e.target.value)}
                  required
                  placeholder="(24) 99999-9999"
                />
              </label>
              <label>
                Cidade
                <input
                  value={jobCity}
                  onChange={(e) => setJobCity(e.target.value)}
                  placeholder="Cidade — UF"
                />
              </label>
              <label>
                Experiência comercial
                <textarea
                  value={jobExp}
                  onChange={(e) => setJobExp(e.target.value)}
                  rows={3}
                  placeholder="Ex.: vendi software B2B, PDV, varejo…"
                />
              </label>
              <button type="submit" className="btn btn--whatsapp">
                <IconLabel icon={<IconWhatsApp />}>Enviar no WhatsApp</IconLabel>
              </button>
              {jobFeedback ? <p className="careers__feedback">{jobFeedback}</p> : null}
            </form>
          </div>
        </section>

        <section id="contato" className="section contact">
          <div className="section__head">
            <p className="eyebrow">Canal CRM</p>
            <h2>Converse com um vendedor Marthi.</h2>
            <p className="empty" style={{ marginTop: 8 }}>
              Sede em {MARTHI_COMPANY.city} — {MARTHI_COMPANY.venue}, {MARTHI_COMPANY.district}. A
              mensagem chega no CRM da equipe comercial.
            </p>
          </div>
          <div className="contact__grid">
            <article>
              <p className="contact__kicker">Sede</p>
              <h3>{MARTHI_COMPANY.venue}</h3>
              <p className="contact__meta">
                {MARTHI_COMPANY.district} · {MARTHI_COMPANY.city} — {MARTHI_COMPANY.stateUf}
              </p>
            </article>
            <article>
              <p className="contact__kicker">
                <IconLabel icon={<IconWhatsApp />}>WhatsApp</IconLabel>
              </p>
              <h3>Fale com a Marthi</h3>
              <a href={WHATSAPP_HREF} className="btn btn--whatsapp" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconWhatsApp />}>
                  Conversar · {MARTHI_COMPANY.whatsappDisplay}
                </IconLabel>
              </a>
            </article>
            <article>
              <p className="contact__kicker">E-mail</p>
              <h3>{MARTHI_COMPANY.email}</h3>
              <a href={MARTHI_COMPANY.emailHref} className="btn btn--ghost">
                Enviar e-mail
              </a>
            </article>
            <article>
              <p className="contact__kicker">
                <IconLabel icon={<IconInstagram />}>Instagram</IconLabel>
              </p>
              <h3>@{MARTHI_COMPANY.instagramHandle}</h3>
              <a href={INSTAGRAM_HREF} className="btn btn--ghost" target="_blank" rel="noreferrer">
                <IconLabel icon={<IconInstagram />}>Abrir Instagram</IconLabel>
              </a>
            </article>
            <article className="home-crm-channel" style={{ gridColumn: '1 / -1' }}>
              <div className="home-crm-channel__head">
                <h3>Chat com a equipe comercial</h3>
                <p className="empty" style={{ margin: 0 }}>
                  Digite nome, WhatsApp e a mensagem. O vendedor responde no app CRM · Conversas.
                </p>
              </div>
              {guestThread.length > 0 ? (
                <div className="home-crm-channel__thread">
                  {guestThread.map((msg) => (
                    <div
                      key={msg.id}
                      className={`home-crm-channel__bubble ${msg.fromLead ? 'is-me' : 'is-them'}`}
                    >
                      <strong>{msg.fromName}</strong>
                      <p>{msg.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <form
                className="admin-form"
                style={{ marginTop: 12 }}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const result = await postHomepageCrmChat({
                    name: contactName,
                    whatsapp: contactPhone,
                    text: contactMsg,
                    leadId: guestLeadId || undefined,
                  });
                  if (!result.ok) {
                    setContactFeedback(result.error);
                    return;
                  }
                  setGuestLeadId(result.lead.id);
                  setGuestThread(listLeadMessages(result.lead.id));
                  setContactFeedback('Mensagem enviada. Um vendedor responde por aqui e no CRM.');
                  setContactMsg('');
                }}
              >
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
                <label className="span-2">
                  Mensagem
                  <input
                    value={contactMsg}
                    onChange={(e) => setContactMsg(e.target.value)}
                    placeholder="Quero conhecer o Marthi…"
                    required
                  />
                </label>
                <div className="span-2 admin-toolbar">
                  <button type="submit" className="btn btn--primary">
                    Enviar no canal CRM
                  </button>
                  {user ? (
                    <Link to="/crm/conversas" className="btn btn--ghost">
                      Abrir CRM · Conversas
                    </Link>
                  ) : null}
                  {contactFeedback ? <span className="empty">{contactFeedback}</span> : null}
                </div>
              </form>
            </article>
          </div>
        </section>
      </main>

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
