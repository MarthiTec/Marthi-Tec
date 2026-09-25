import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicHeader } from '../components/public/PublicHeader';
import { PublicFooter } from '../components/public/PublicFooter';
import { PARTNER_MODULES, type PartnerModuleId } from '../data/catalog';
import { getCommercialPlans, PLANS_UPDATED_EVENT, type CommercialPlan } from '../data/plansStore';
import { MARTHI_COMPANY, marthiWhatsAppHref } from '../data/companyContact';
import './publicPages.css';

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const FAQ_ITEMS = [
  {
    q: 'Preciso comprar novos computadores ou equipamentos para usar a Marthi?',
    a: 'Não! O sistema Marthi roda diretamente no navegador ou em computadores comuns que sua loja já possui. Para o Totem de autoatendimento, oferecemos modelos prontos com tela touch e leitor integrado, mas você também pode utilizar telas já existentes.',
  },
  {
    q: 'Como funciona o treinamento e a implantação inicial?',
    a: 'Nosso time acompanha todo o processo: cadastramos sua loja, importamos seus produtos, configuramos suas tabelas fiscais e treinamos seus operadores de caixa e oficina. Você começa a operar com total segurança.',
  },
  {
    q: 'Posso trocar de plano ou adicionar novos módulos depois?',
    a: 'Sim, a qualquer momento! A Marthi cresce com a sua loja. Você pode iniciar enxuto no plano Bronze e migrar para Silver ou Golden com apenas um clique ou mensagem para nosso suporte.',
  },
  {
    q: 'Existe contrato de fidelidade ou multa rescisória?',
    a: 'Não exigimos fidelidade. Confiamos na qualidade da nossa solução e na satisfação dos nossos clientes. Você tem total liberdade.',
  },
  {
    q: 'E se a internet cair na loja durante uma venda no caixa?',
    a: 'Nosso PDV foi projetado com resiliência local. O operador consegue concluir a venda e os dados são sincronizados automaticamente assim que a conexão for restabelecida.',
  },
];

export function PlansPublicPage() {
  const [commercialPlans, setCommercialPlans] = useState<CommercialPlan[]>(() => getCommercialPlans());
  const [selectedModules, setSelectedModules] = useState<PartnerModuleId[]>(['erp', 'os']);

  useEffect(() => {
    function refresh() {
      setCommercialPlans(getCommercialPlans());
    }
    window.addEventListener(PLANS_UPDATED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PLANS_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  function toggleModule(id: PartnerModuleId) {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  // Calculate recommended plan based on selected modules
  const moduleCount = selectedModules.length;
  const bronze = commercialPlans.find((p) => p.id === 'bronze');
  const silver = commercialPlans.find((p) => p.id === 'silver');
  const golden = commercialPlans.find((p) => p.id === 'golden');

  let recommendedPlan = 'silver';
  let recommendedText = `Plano ${silver?.name || 'Silver'} (Até ${silver?.maxModules || 2} módulos)`;
  let recommendedPrice = `${silver?.promotionalPrice || silver?.price || 'R$ 497'}${silver?.period || '/mês'}`;

  if (moduleCount <= 1) {
    recommendedPlan = 'bronze';
    recommendedText = `Plano ${bronze?.name || 'Bronze'} (${bronze?.maxModules || 1} módulo)`;
    recommendedPrice = `${bronze?.promotionalPrice || bronze?.price || 'R$ 197'}${bronze?.period || '/mês'}`;
  } else if (moduleCount >= 3) {
    recommendedPlan = 'golden';
    recommendedText = `Plano ${golden?.name || 'Golden'} (Todos os módulos liberados)`;
    recommendedPrice = `${golden?.promotionalPrice || golden?.price || 'R$ 597'}${golden?.period || '/mês'}`;
  }

  return (
    <div className="public-page">
      <PublicHeader />

      <main className="public-page__main">
        {/* Hero */}
        <section className="public-hero">
          <span className="public-hero__badge">Planos transparentes & escaláveis</span>
          <h1>A solução certa para cada fase da sua empresa.</h1>
          <p>
            Sem contratos com letrinhas miúdas ou surpresas na fatura. Escolha os módulos que seu negócio
            precisa agora e expanda com tranquilidade.
          </p>
        </section>

        {/* Pricing Cards */}
        <section className="plans-grid">
          {commercialPlans.map((plan) => {
            const isFeatured = plan.featured;
            return (
              <article
                key={plan.id}
                className={`plan-card ${isFeatured ? 'plan-card--featured' : ''}`}
              >
                {isFeatured ? (
                  <div className="plan-card__badge">{plan.commercialCallout || 'Mais escolhido'}</div>
                ) : null}

                <div>
                  <div className="plan-card__header">
                    <h2 className="plan-card__name">{plan.name}</h2>
                    <p className="plan-card__blurb">{plan.blurb}</p>
                    <div className="plan-card__price-row">
                      {plan.promotionalPrice ? (
                        <>
                          <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.85em', marginRight: '6px' }}>
                            {plan.price}
                          </span>
                          <span className="plan-card__price">{plan.promotionalPrice}</span>
                        </>
                      ) : (
                        <span className="plan-card__price">{plan.price}</span>
                      )}
                      <span className="plan-card__period">{plan.period}</span>
                    </div>
                  </div>

                  <ul className="plan-card__features">
                    {plan.features.map((feature, i) => (
                      <li key={i}>
                        <CheckIcon />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  to={`/parceiro?plano=${plan.id}`}
                  className={`plan-card__cta ${
                    isFeatured ? 'plan-card__cta--primary' : 'plan-card__cta--ghost'
                  }`}
                >
                  Contratar {plan.name}
                </Link>
              </article>
            );
          })}
        </section>

        {/* Interactive Module Simulator */}
        <section className="simulator-box">
          <div className="simulator-box__head">
            <span className="public-hero__badge">Simulador Interativo</span>
            <h3>Não sabe qual plano escolher? Marque os módulos que você precisa:</h3>
            <p>Calculamos na hora qual é a melhor contratação para a sua operação.</p>
          </div>

          <div className="simulator-modules-grid">
            {PARTNER_MODULES.map((mod) => {
              const isChecked = selectedModules.includes(mod.id);
              return (
                <div
                  key={mod.id}
                  className={`simulator-item ${isChecked ? 'is-selected' : ''}`}
                  onClick={() => toggleModule(mod.id)}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by parent onClick
                    tabIndex={-1}
                  />
                  <div>
                    <strong>{mod.name}</strong>
                    <span>{mod.blurb}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="simulator-result">
            <div className="simulator-result__info">
              <strong>
                Recomendado para {moduleCount} {moduleCount === 1 ? 'módulo' : 'módulos'}:{' '}
                {recommendedText} — {recommendedPrice}
              </strong>
              <span>
                {moduleCount >= 3
                  ? 'O plano Golden já inclui TODOS os módulos do ecossistema sem custo extra!'
                  : 'Você pode adicionar ou remover módulos quando quiser.'}
              </span>
            </div>

            <Link to={`/parceiro?plano=${recommendedPlan}`} className="plan-card__cta plan-card__cta--primary">
              Contratar com este perfil →
            </Link>
          </div>
        </section>

        {/* Comparativo Detalhado */}
        <section className="comparison-section">
          <h2>Comparativo completo de recursos</h2>

          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Recursos e Funcionalidades</th>
                  <th>Bronze (R$ 197)</th>
                  <th>Silver (R$ 497)</th>
                  <th>Golden (R$ 597)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Módulos ativos permitidos</strong></td>
                  <td>1 módulo</td>
                  <td>Até 2 módulos</td>
                  <td><strong>Todos os 5 módulos</strong></td>
                </tr>
                <tr>
                  <td>Painel da Loja & Perfil Operacional</td>
                  <td>✓ Incluso</td>
                  <td>✓ Incluso</td>
                  <td>✓ Incluso</td>
                </tr>
                <tr>
                  <td>Multi-usuários com controle de permissões</td>
                  <td>—</td>
                  <td>✓ Incluso</td>
                  <td>✓ Incluso ilimitado</td>
                </tr>
                <tr>
                  <td>Backup em nuvem automático</td>
                  <td>✓ Diário</td>
                  <td>✓ Em tempo real</td>
                  <td>✓ Em tempo real prioritário</td>
                </tr>
                <tr>
                  <td>Emissor Fiscal (NF-e, NFC-e, NFS-e, CT-e, MDF-e)</td>
                  <td>Se escolhido</td>
                  <td>Se escolhido</td>
                  <td>✓ Completo & integrado</td>
                </tr>
                <tr>
                  <td>Sincronização com Marketplaces (E-commerce)</td>
                  <td>Se escolhido</td>
                  <td>Se escolhido</td>
                  <td>✓ Completo</td>
                </tr>
                <tr>
                  <td>Personalização com a marca da sua loja</td>
                  <td>Básica</td>
                  <td>✓ Completa</td>
                  <td>✓ Completa VIP</td>
                </tr>
                <tr>
                  <td>Suporte técnico</td>
                  <td>Horário comercial</td>
                  <td>Comercial prioritário</td>
                  <td><strong>Suporte VIP prioritário contínuo</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Perguntas Frequentes */}
        <section className="public-faq">
          <h2>Dúvidas Frequentes</h2>
          <p className="public-faq__lead">
            Tudo o que você precisa saber antes de dar o próximo passo com a Marthi.
          </p>

          <div className="faq-list">
            {FAQ_ITEMS.map((item, index) => (
              <div key={index} className="faq-card">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* WhatsApp Banner */}
        <section style={{ maxWidth: '960px', margin: '0 auto 72px', padding: '0 20px', textAlign: 'center' }}>
          <div
            style={{
              padding: '40px 24px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #0f766e 0%, #0a5550 100%)',
              color: '#ffffff',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: '1.8rem', fontWeight: 750 }}>
              Precisa de uma proposta personalizada para sua rede?
            </h3>
            <p style={{ margin: '0 auto 24px', maxWidth: '52ch', color: 'rgba(255,255,255,0.85)' }}>
              Fale diretamente com a diretoria comercial da Marthi pelo WhatsApp e monte um pacote
              adaptado ao número de lojas e terminais da sua operação.
            </p>
            <a
              href={marthiWhatsAppHref('Olá! Tenho uma rede de lojas e gostaria de uma proposta personalizada.')}
              target="_blank"
              rel="noreferrer"
              className="btn btn--whatsapp"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '999px',
                background: '#25d366',
                color: '#fff',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Conversar no WhatsApp: {MARTHI_COMPANY.whatsappDisplay}
            </a>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
