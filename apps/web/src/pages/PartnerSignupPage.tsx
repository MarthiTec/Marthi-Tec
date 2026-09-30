import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { AdminPicker } from '../components/AdminPicker';
import {
  BRAZIL_UFS,
  PARTNER_MODULES,
  PLANS,
  getPlanById,
  getPlanModuleLimit,
  normalizePlanId,
  planIncludesAllModules,
  type PartnerModuleId,
  type PlanId,
} from '../data/catalog';
import { submitPartnerSignup } from '../services/partners';
import { lookupCnpjData } from '../services/cnpj';
import { isValidCnpj, isValidCpf } from '../utils/documentUtils';
import { markStoreContracted } from '../data/demoLeadStore';
import { saveStoreEntitlement } from '../data/storePlan';
import {
  SEGMENT_PRESETS,
  STORE_SEGMENT_OPTIONS,
  applySegmentPreset,
  type SegmentPreset,
  type StoreSegmentId,
} from '../data/storeSegment';
import {
  generateStoreAccessToken,
  saveStore,
} from '../data/multiStoreStore';
import './partner-signup.css';

type Step = 1 | 2 | 3 | 4;

type FormState = {
  planId: PlanId;
  modules: PartnerModuleId[];
  documentType: 'cnpj' | 'cpf';
  document: string;
  legalName: string;
  tradeName: string;
  stateRegistration: string;
  municipalRegistration: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  segment: string;
  segmentId: StoreSegmentId;
  contactName: string;
  contactRole: string;
  notes: string;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function maskDocument(type: 'cnpj' | 'cpf', value: string) {
  const digits = onlyDigits(value).slice(0, type === 'cnpj' ? 14 : 11);
  if (type === 'cpf') {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function maskPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function maskZip(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, '$1-$2');
}

function allModuleIds(): PartnerModuleId[] {
  return PARTNER_MODULES.map((module) => module.id);
}

function clampModulesForPlan(planId: PlanId, modules: PartnerModuleId[]) {
  if (planIncludesAllModules(planId)) {
    return allModuleIds();
  }
  const limit = getPlanModuleLimit(planId);
  return modules.slice(0, limit);
}

function initialForm(planFromQuery: string | null): FormState {
  const planId = normalizePlanId(planFromQuery) ?? 'silver';
  return {
    planId,
    modules: clampModulesForPlan(planId, ['totem']),
    documentType: 'cnpj',
    document: '',
    legalName: '',
    tradeName: '',
    stateRegistration: '',
    municipalRegistration: '',
    email: '',
    phone: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: 'RJ',
    segment: 'Oficina & Celulares',
    segmentId: 'assistencia_tecnica',
    contactName: '',
    contactRole: '',
    notes: '',
  };
}

export function PartnerSignupPage() {
  const [params] = useSearchParams();
  const planFromQuery = params.get('plano');
  const goPayment = params.get('passo') === 'pagamento' || Boolean(normalizePlanId(planFromQuery));
  const [step, setStep] = useState<Step>(() => (goPayment ? 4 : 1));
  const [form, setForm] = useState<FormState>(() => initialForm(planFromQuery));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<'pix' | 'card'>('pix');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<StoreSegmentId>('assistencia_tecnica');
  const [companyAccessToken, setCompanyAccessToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const selectedPlan = useMemo(() => getPlanById(form.planId), [form.planId]);
  const moduleLimit = getPlanModuleLimit(form.planId);
  const lockedAllModules = planIncludesAllModules(form.planId);

  async function handleCnpjLookup(raw: string) {
    const digits = onlyDigits(raw);
    if (digits.length !== 14) {
      setCnpjStatus(null);
      return;
    }
    if (!isValidCnpj(digits)) {
      setCnpjStatus({
        type: 'error',
        message: 'CNPJ inválido (dígitos verificadores incorretos).',
      });
      return;
    }
    setCnpjLoading(true);
    setCnpjStatus({ type: 'info', message: 'Consultando dados na Receita Federal e SEFAZ…' });
    try {
      const data = await lookupCnpjData(digits);
      setForm((current) => ({
        ...current,
        legalName: data.legalName || current.legalName,
        tradeName: data.tradeName || current.tradeName,
        stateRegistration: data.stateRegistration || current.stateRegistration,
        zipCode: data.zipCode || current.zipCode,
        street: data.street || current.street,
        number: data.number || current.number,
        complement: data.complement || current.complement,
        district: data.district || current.district,
        city: data.city || current.city,
        state: data.state || current.state,
        phone: data.phone || current.phone,
        email: current.email || data.email || '',
      }));
      const ieInfo = data.stateRegistration ? ` · IE: ${data.stateRegistration}` : '';
      setCnpjStatus({
        type: 'success',
        message: `✓ Dados da empresa, endereço${ieInfo} preenchidos via Receita Federal / SEFAZ.`,
      });
      setCepStatus(null);
    } catch (err) {
      setCnpjStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Não foi possível consultar os dados do CNPJ.',
      });
    } finally {
      setCnpjLoading(false);
    }
  }

  function handleSelectSegment(preset: SegmentPreset) {
    setSelectedSegment(preset.id);
    setForm((current) => ({
      ...current,
      segment: preset.name,
      ...(!planIncludesAllModules(current.planId) && preset.recommendedModules.length > 0
        ? { modules: preset.recommendedModules.slice(0, getPlanModuleLimit(current.planId)) }
        : {}),
    }));
  }

  async function lookupCep(raw: string) {
    const digits = onlyDigits(raw);
    if (digits.length !== 8) {
      setCepStatus(null);
      return;
    }
    setCepStatus('Buscando CEP…');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        setCepStatus('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      setForm((current) => ({
        ...current,
        street: data.logradouro?.trim() || current.street,
        district: data.bairro?.trim() || current.district,
        city: data.localidade?.trim() || current.city,
        state: data.uf?.trim() || current.state,
      }));
      setCepStatus('Endereço preenchido pelo CEP.');
    } catch {
      setCepStatus('Não foi possível consultar o CEP agora.');
    }
  }

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPlan(planId: PlanId) {
    setForm((current) => ({
      ...current,
      planId,
      modules: clampModulesForPlan(planId, current.modules.length ? current.modules : ['totem']),
    }));
  }

  function toggleModule(id: PartnerModuleId) {
    if (lockedAllModules) return;
    setForm((current) => {
      const exists = current.modules.includes(id);
      if (exists) {
        return { ...current, modules: current.modules.filter((item) => item !== id) };
      }
      if (current.modules.length >= getPlanModuleLimit(current.planId)) {
        setError(
          current.planId === 'bronze'
            ? 'No plano Bronze você pode liberar apenas 1 módulo.'
            : 'No plano Silver você pode selecionar no máximo 2 módulos.',
        );
        return current;
      }
      setError(null);
      return { ...current, modules: [...current.modules, id] };
    });
  }

  function validateStep(current: Step): string | null {
    if (current === 1 && !form.planId) return 'Selecione um plano.';
    if (current === 2) {
      if (form.modules.length === 0) {
        return 'Escolha ao menos um módulo (Totem & Cardápio Digital, OS, PDV + Retaguarda, Fiscal ou E-commerce).';
      }
      if (lockedAllModules && form.modules.length < PARTNER_MODULES.length) {
        return 'No plano Golden todos os módulos ficam liberados.';
      }
      if (!lockedAllModules && form.modules.length > moduleLimit) {
        return `Este plano permite no máximo ${moduleLimit} módulo(s).`;
      }
      if (form.planId === 'bronze' && form.modules.length !== 1) {
        return 'No plano Bronze selecione exatamente 1 módulo.';
      }
      if (form.planId === 'silver' && (form.modules.length < 1 || form.modules.length > 2)) {
        return 'No plano Silver selecione 1 ou 2 módulos.';
      }
    }
    if (current === 3 || current === 4) {
      const docDigits = onlyDigits(form.document);
      if (form.documentType === 'cnpj') {
        if (docDigits.length !== 14 || !isValidCnpj(docDigits)) {
          return 'Informe um CNPJ válido com dígitos verificadores corretos.';
        }
      } else {
        if (docDigits.length !== 11 || !isValidCpf(docDigits)) {
          return 'Informe um CPF válido com dígitos verificadores corretos.';
        }
      }
      if (!form.legalName.trim()) {
        return form.documentType === 'cnpj'
          ? 'Informe a razão social.'
          : 'Informe o nome completo.';
      }
      if (!form.tradeName.trim()) return 'Informe o nome fantasia.';
      if (!form.email.trim()) return 'Informe o e-mail.';
      if (onlyDigits(form.phone).length < 10) return 'Informe o telefone com DDD.';
      if (onlyDigits(form.zipCode).length !== 8) return 'Informe o CEP.';
      if (!form.street.trim() || !form.number.trim() || !form.district.trim() || !form.city.trim()) {
        return 'Complete o endereço (rua, número, bairro e cidade).';
      }
      if (!form.contactName.trim()) return 'Informe o responsável pelo contato.';
    }
    if (current === 4 && payMethod === 'card') {
      if (!cardName.trim()) return 'Informe o nome no cartão.';
      if (onlyDigits(cardNumber).length < 13) return 'Informe o número do cartão.';
      if (onlyDigits(cardExpiry).length < 4) return 'Informe a validade (MM/AA).';
      if (onlyDigits(cardCvv).length < 3) return 'Informe o CVV.';
    }
    return null;
  }

  function goNext() {
    const message = validateStep(step);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setStep((current) => Math.min(4, current + 1) as Step);
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1) as Step);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const message = validateStep(4);
    if (message) {
      setError(message);
      return;
    }

    setSubmitting(true);
    setError(null);

    const ieInfo = form.stateRegistration.trim() ? `IE: ${form.stateRegistration.trim()}` : '';
    const imInfo = form.municipalRegistration.trim() ? `IM: ${form.municipalRegistration.trim()}` : '';
    const notesMerged = [form.notes.trim(), ieInfo, imInfo].filter(Boolean).join(' · ');

    const txRef = `PAY-${Date.now().toString(36).toUpperCase()}`;

    // Gera o Token de Acesso exclusivo para a empresa contratante
    const generatedToken = generateStoreAccessToken(form.document, form.email);
    setCompanyAccessToken(generatedToken);

    try {
      const result = await submitPartnerSignup({
        planId: form.planId,
        modules: form.modules,
        documentType: form.documentType,
        document: form.document,
        legalName: form.legalName.trim(),
        tradeName: form.tradeName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        zipCode: form.zipCode.trim(),
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        district: form.district.trim(),
        city: form.city.trim(),
        state: form.state,
        segment: form.segment.trim(),
        contactName: form.contactName.trim(),
        contactRole: form.contactRole.trim(),
        notes: notesMerged,
        payNow: true,
        paymentMethod: payMethod,
        transactionRef: txRef,
      });

      // Salva ou atualiza a loja matriz com seu Token de Acesso e Ramo configurados
      saveStore({
        code: '001',
        name: form.legalName.trim(),
        tradeName: form.tradeName.trim(),
        cnpj: form.document.trim(),
        stateRegistration: form.stateRegistration.trim(),
        municipalRegistration: form.municipalRegistration.trim(),
        accessToken: generatedToken,
        email: form.email.trim(),
        phone: form.phone.trim(),
        zipCode: form.zipCode.trim(),
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        neighborhood: form.district.trim(),
        city: form.city.trim(),
        state: form.state,
        isMatrix: true,
        segmentId: selectedSegment,
      });

      await saveStoreEntitlement({ planId: form.planId, modules: form.modules });
      applySegmentPreset(selectedSegment);
      markStoreContracted();
      setProtocol(result.id);
      void import('../data/crmStore').then(({ ingestPartnerLeadToCrm }) => {
        ingestPartnerLeadToCrm({
          protocol: result.id,
          tradeName: form.tradeName.trim() || form.legalName.trim(),
          contactName: form.contactName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          planName: selectedPlan.name,
        });
      });
      void import('../data/marthiClientsStore').then(({ ingestPartnerSignupToMarthiClients }) => {
        ingestPartnerSignupToMarthiClients({
          protocol: result.id,
          tradeName: form.tradeName.trim() || form.legalName.trim(),
          legalName: form.legalName.trim(),
          document: form.document.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          planId: form.planId,
          modules: form.modules,
          paymentOk: true,
          notes: notesMerged || `Cadastro parceiro · ${selectedPlan.name}`,
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao processar contratação.');
    } finally {
      setSubmitting(false);
    }
  }

  if (protocol) {
    return (
      <div className="partner">
        <div className="partner__shell partner__shell--success" style={{ maxWidth: '620px', textAlign: 'center' }}>
          <BrandLogo variant="lockup" className="partner__lockup" />
          <h1 style={{ color: '#4ade80', margin: '20px 0 12px' }}>Contratação Confirmada com Sucesso! 🚀</h1>
          <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#e2e8f0' }}>
            Parabéns! O investimento para o plano <strong>{selectedPlan.name}</strong> foi aprovado.
            A conta da empresa <strong>{form.tradeName}</strong> já foi criada no sistema.
          </p>

          {/* Card do Token de Acesso da Empresa */}
          {companyAccessToken && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '8px',
                padding: '16px',
                margin: '16px 0',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ color: '#38bdf8', fontSize: '14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🔑 Token de Acesso da Empresa (CNPJ / E-mail)
                </strong>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(companyAccessToken);
                    setTokenCopied(true);
                    setTimeout(() => setTokenCopied(false), 3000);
                  }}
                  className="btn btn--secondary"
                  style={{ padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
                >
                  {tokenCopied ? '✓ Copiado!' : 'Copiar Token'}
                </button>
              </div>
              <code
                style={{
                  display: 'block',
                  background: '#090d16',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  color: '#4ade80',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  letterSpacing: '0.5px',
                  wordBreak: 'break-all',
                }}
              >
                {companyAccessToken}
              </code>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                Este token vincula os lançamentos dos módulos (Totem, Retaguarda, OS, PDV, Emissor Fiscal, E-commerce e Usuários)
                às credenciais exclusivas da sua empresa.
              </p>
            </div>
          )}

          <div
            style={{
              background: 'rgba(45, 212, 191, 0.08)',
              border: '1px solid rgba(45, 212, 191, 0.25)',
              borderRadius: '8px',
              padding: '16px',
              margin: '20px 0',
              textAlign: 'left',
            }}
          >
            <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#cbd5e1' }}>
              📧 <strong>E-mail de ativação enviado para:</strong>{' '}
              <span style={{ color: '#2dd4bf', fontWeight: 600 }}>{form.email}</span>
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              Por segurança, não criamos senhas automáticas em texto puro. Enviamos um link seguro
              de uso único para você definir sua própria senha de acesso.
            </p>
          </div>
          <p className="partner__protocol" style={{ margin: '16px 0' }}>
            Protocolo da Contratação: <strong>{protocol}</strong>
          </p>
          <div className="partner__actions" style={{ justifyContent: 'center', marginTop: '24px' }}>
            <Link to="/login" className="btn btn--primary">
              Ir para Tela de Acesso
            </Link>
            <Link to="/" className="btn btn--ghost">
              Voltar ao Site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="partner">
      <header className="partner__top">
        <Link to="/" className="partner__back">
          ← Voltar
        </Link>
        <div className="partner__brand">
          <BrandLogo variant="lockup" className="partner__lockup" />
          <div>
            <strong>Cadastro de parceiro</strong>
            <span>Contrate e liberamos a loja</span>
          </div>
        </div>
      </header>

      <ol className="partner__steps" aria-label="Etapas">
        {[
          { id: 1, label: 'Plano' },
          { id: 2, label: 'Módulos' },
          { id: 3, label: 'Empresa' },
          { id: 4, label: 'Pagamento' },
        ].map((item) => (
          <li key={item.id} className={step === item.id ? 'is-active' : step > item.id ? 'is-done' : ''}>
            <span>{step > item.id ? '✓' : item.id}</span>
            {item.label}
          </li>
        ))}
      </ol>

      <form className="partner__shell" onSubmit={handleSubmit}>
        {error && (
          <p className="partner__error" role="alert">
            {error}
          </p>
        )}

        {step === 1 && (
          <section className="partner__section">
            <h1>Qual plano você quer aderir?</h1>
            <p className="partner__lead">
              Escolha o ritmo do contrato. Os módulos você ajusta na próxima etapa — o painel da loja
              já vem incluso em todos.
            </p>
            <div className="partner__plans">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`partner-plan partner-plan--${plan.id} ${form.planId === plan.id ? 'is-active' : ''}`}
                  onClick={() => selectPlan(plan.id)}
                >
                  {'featured' in plan && plan.featured ? (
                    <span className="partner-plan__badge">Mais escolhido</span>
                  ) : (
                    <span className="partner-plan__badge" style={{ visibility: 'hidden' }}>
                      —
                    </span>
                  )}
                  <h2>{plan.name}</h2>
                  <p className="partner-plan__price">
                    {plan.price}
                    <small>{plan.period}</small>
                  </p>
                  <p>{plan.blurb}</p>
                  <ul className="partner-plan__features">
                    {plan.features.slice(0, 3).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <small className="partner-plan__limit">
                    {planIncludesAllModules(plan.id)
                      ? 'Módulos: todos integrados'
                      : `Módulos: até ${plan.maxModules}`}
                  </small>
                </button>
              ))}
            </div>

            {/* Ramo de Atividade da Loja (Definido na aquisição do plano) */}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
              <div style={{ marginBottom: 14 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>
                  Qual é o Ramo de Atividade da sua loja?
                </h2>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--mute)' }}>
                  Defina o segmento para a loja já iniciar pronta e configurada para você (ex.: Moda ativa grade de cores/tamanhos e oculta IMEI; Oficina e eletrônicos já marca IMEI e senhas de aparelhos).
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                {SEGMENT_PRESETS.map((preset) => {
                  const isSelected = selectedSegment === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectSegment(preset)}
                      className={`partner-plan ${isSelected ? 'is-active' : ''}`}
                      style={{
                        padding: '16px 18px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.4rem' }}>{preset.icon}</span>
                          <strong style={{ fontSize: '0.92rem' }}>{preset.name}</strong>
                        </div>
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: isSelected ? '5px solid #0f766e' : '2px solid #cbd5e1',
                            background: '#fff',
                            boxSizing: 'border-box',
                            flexShrink: 0,
                          }}
                        />
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mute)', lineHeight: 1.35 }}>
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="partner__section">
            <h1>O que você quer usar?</h1>
            <p className="partner__lead">
              {lockedAllModules
                ? 'No Golden todos os módulos já vêm liberados e integrados. O painel da loja já está incluso.'
                : form.planId === 'bronze'
                  ? 'No Bronze escolha 1 módulo. O painel da loja já está incluso em qualquer plano.'
                  : 'No Silver escolha até 2 módulos. O painel da loja já está incluso em qualquer plano.'}
            </p>
            <p className="partner__module-count">
              {lockedAllModules
                ? `${PARTNER_MODULES.length} de ${PARTNER_MODULES.length} módulos liberados`
                : `${form.modules.length} de ${moduleLimit} módulo(s) selecionado(s)`}
            </p>
            <div className="partner__modules">
              {PARTNER_MODULES.map((module) => {
                const checked = form.modules.includes(module.id);
                const atLimit =
                  !lockedAllModules && !checked && form.modules.length >= moduleLimit;
                return (
                  <label
                    key={module.id}
                    className={`partner-module ${checked ? 'is-active' : ''} ${atLimit ? 'is-disabled' : ''} ${lockedAllModules ? 'is-included' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={lockedAllModules || atLimit}
                      onChange={() => toggleModule(module.id)}
                    />
                    <strong>{module.name}</strong>
                    <span>{module.blurb}</span>
                  </label>
                );
              })}
            </div>
            <p className="partner__platform-note">
              Incluso em todo plano: <strong>Painel da loja</strong> (perfil do operador e gestão).
            </p>
          </section>
        )}

        {step === 3 && (
          <section className="partner__section">
            <h1>Dados da empresa</h1>
            <p className="partner__lead">
              Usamos essas informações para contrato, emissão e liberação do ambiente do parceiro.
            </p>

            <div className="partner__doc-type" role="group" aria-label="Tipo de documento">
              <button
                type="button"
                className={form.documentType === 'cnpj' ? 'is-active' : ''}
                onClick={() => {
                  patch('documentType', 'cnpj');
                  patch('document', '');
                }}
              >
                CNPJ
              </button>
              <button
                type="button"
                className={form.documentType === 'cpf' ? 'is-active' : ''}
                onClick={() => {
                  patch('documentType', 'cpf');
                  patch('document', '');
                }}
              >
                CPF
              </button>
            </div>

            <div className="partner__grid">
              <label>
                <span>{form.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}</span>
                <div className="partner__input-action">
                  <input
                    value={form.document}
                    onChange={(e) => {
                      const next = maskDocument(form.documentType, e.target.value);
                      patch('document', next);
                      if (form.documentType === 'cnpj') {
                        const digits = onlyDigits(next);
                        if (digits.length === 14) {
                          void handleCnpjLookup(digits);
                        } else {
                          setCnpjStatus(null);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (form.documentType === 'cnpj') {
                        void handleCnpjLookup(form.document);
                      }
                    }}
                    inputMode="numeric"
                    placeholder={form.documentType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
                    required
                  />
                  {form.documentType === 'cnpj' && (
                    <button
                      type="button"
                      className="partner__btn-lookup"
                      disabled={cnpjLoading || onlyDigits(form.document).length !== 14}
                      onClick={() => void handleCnpjLookup(form.document)}
                      title="Consultar dados da empresa na Receita Federal e SEFAZ"
                    >
                      {cnpjLoading ? 'Buscando…' : 'Buscar'}
                    </button>
                  )}
                </div>
                {cnpjStatus ? (
                  <span className={`partner__hint partner__hint--${cnpjStatus.type}`}>
                    {cnpjStatus.message}
                  </span>
                ) : form.documentType === 'cnpj' ? (
                  <span className="partner__hint" style={{ color: 'var(--mute)' }}>
                    Ao preencher o CNPJ, buscamos IE e endereço na Receita Federal e SEFAZ.
                  </span>
                ) : null}
              </label>

              <label>
                {form.documentType === 'cnpj' ? 'Razão social' : 'Nome completo'}
                <input
                  value={form.legalName}
                  onChange={(e) => patch('legalName', e.target.value)}
                  placeholder={form.documentType === 'cnpj' ? 'Razão social da empresa' : 'Nome completo'}
                  required
                />
              </label>

              <label>
                Nome fantasia
                <input
                  value={form.tradeName}
                  onChange={(e) => patch('tradeName', e.target.value)}
                  placeholder="Nome fantasia da loja"
                  required
                />
              </label>

              <label>
                Inscrição Estadual (IE)
                <input
                  value={form.stateRegistration}
                  onChange={(e) => patch('stateRegistration', e.target.value.toUpperCase())}
                  placeholder="Número da IE ou ISENTO"
                />
                <span className="partner__hint" style={{ color: 'var(--mute)' }}>
                  {form.stateRegistration
                    ? 'Preenchido automaticamente via SEFAZ'
                    : 'Obrigatório para emissão de NF-e/NFC-e ou ISENTO'}
                </span>
              </label>

              <label>
                Inscrição Municipal (IM)
                <input
                  value={form.municipalRegistration}
                  onChange={(e) => patch('municipalRegistration', e.target.value.toUpperCase())}
                  placeholder="Número da IM ou ISENTO"
                />
                <span className="partner__hint" style={{ color: 'var(--mute)' }}>
                  {form.municipalRegistration
                    ? 'Inscrição Municipal preenchida'
                    : 'Inscrição municipal do alvará ou NFS-e de serviços'}
                </span>
              </label>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <AdminPicker
                  label="Ramo de Atividade da Empresa *"
                  value={selectedSegment}
                  options={STORE_SEGMENT_OPTIONS}
                  onChange={(val) => {
                    const segId = val as StoreSegmentId;
                    setSelectedSegment(segId);
                    patch('segmentId', segId);
                    const preset = SEGMENT_PRESETS.find((p) => p.id === segId);
                    if (preset) handleSelectSegment(preset);
                  }}
                />
                <span className="partner__hint" style={{ color: 'var(--mute)' }}>
                  Define o ecossistema da loja (OS, mesas e cardápio, grade de moda, balança).
                </span>
              </div>
              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => patch('email', e.target.value)}
                  required
                />
              </label>
              <label>
                Telefone / WhatsApp
                <input
                  value={form.phone}
                  onChange={(e) => patch('phone', maskPhone(e.target.value))}
                  inputMode="tel"
                  required
                />
              </label>
              <label>
                CEP
                <input
                  value={form.zipCode}
                  onChange={(e) => {
                    const next = maskZip(e.target.value);
                    patch('zipCode', next);
                    if (onlyDigits(next).length === 8) void lookupCep(next);
                    else setCepStatus(null);
                  }}
                  onBlur={() => void lookupCep(form.zipCode)}
                  inputMode="numeric"
                  required
                />
                {cepStatus ? <span className="partner__hint">{cepStatus}</span> : null}
              </label>
              <label className="partner__span-2">
                Endereço (logradouro)
                <input
                  value={form.street}
                  onChange={(e) => patch('street', e.target.value)}
                  required
                />
              </label>
              <label>
                Número
                <input
                  value={form.number}
                  onChange={(e) => patch('number', e.target.value)}
                  required
                />
              </label>
              <label>
                Complemento
                <input
                  value={form.complement}
                  onChange={(e) => patch('complement', e.target.value)}
                />
              </label>
              <label>
                Bairro
                <input
                  value={form.district}
                  onChange={(e) => patch('district', e.target.value)}
                  required
                />
              </label>
              <label>
                Cidade
                <input
                  value={form.city}
                  onChange={(e) => patch('city', e.target.value)}
                  required
                />
              </label>
              <AdminPicker
                label="UF"
                value={form.state}
                options={BRAZIL_UFS.map((uf) => ({ value: uf, label: uf }))}
                onChange={(val) => patch('state', val)}
              />
              <label>
                Responsável
                <input
                  value={form.contactName}
                  onChange={(e) => patch('contactName', e.target.value)}
                  required
                />
              </label>
              <label>
                Cargo (opcional)
                <input
                  value={form.contactRole}
                  onChange={(e) => patch('contactRole', e.target.value)}
                />
              </label>
              <label className="partner__span-2">
                Observações
                <textarea
                  value={form.notes}
                  onChange={(e) => patch('notes', e.target.value)}
                  rows={3}
                  placeholder="Quantidade de lojas, prazo, necessidade especial…"
                />
              </label>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="partner__section">
            <h1>Pagamento</h1>
            <p className="partner__lead">
              Finalize a contratação do plano {selectedPlan.name}. Na demo o pagamento é simulado —
              em produção cai no gateway.
            </p>

            <div className="partner__review">
              <article>
                <h2>Plano</h2>
                <p>
                  <strong>{selectedPlan.name}</strong> — {selectedPlan.price}
                  {selectedPlan.period}
                </p>
                <ul>
                  {selectedPlan.features.slice(0, 4).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </article>
              <article>
                <h2>Módulos</h2>
                <p>
                  {form.modules
                    .map((id) => PARTNER_MODULES.find((item) => item.id === id)?.name)
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
                {goPayment ? (
                  <div className="partner__modules" style={{ marginTop: 12 }}>
                    {PARTNER_MODULES.map((module) => {
                      const checked = form.modules.includes(module.id);
                      const atLimit =
                        !lockedAllModules && !checked && form.modules.length >= moduleLimit;
                      return (
                        <label
                          key={module.id}
                          className={`partner-module ${checked ? 'is-active' : ''} ${atLimit ? 'is-disabled' : ''} ${lockedAllModules ? 'is-included' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={lockedAllModules || atLimit}
                            onChange={() => toggleModule(module.id)}
                          />
                          <strong>{module.name}</strong>
                          <span>{module.blurb}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            </div>

            {goPayment || !form.tradeName ? (
              <div className="partner__grid" style={{ marginTop: 20 }}>
                <label>
                  Nome fantasia
                  <input
                    value={form.tradeName}
                    onChange={(e) => patch('tradeName', e.target.value)}
                    required
                  />
                </label>
                <label>
                  {form.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}
                  <input
                    value={form.document}
                    onChange={(e) => patch('document', maskDocument(form.documentType, e.target.value))}
                    inputMode="numeric"
                    required
                  />
                </label>
                <label>
                  Razão social / Nome
                  <input
                    value={form.legalName}
                    onChange={(e) => patch('legalName', e.target.value)}
                    required
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => patch('email', e.target.value)}
                    required
                  />
                </label>
                <label>
                  WhatsApp
                  <input
                    value={form.phone}
                    onChange={(e) => patch('phone', maskPhone(e.target.value))}
                    inputMode="tel"
                    required
                  />
                </label>
                <label>
                  Responsável
                  <input
                    value={form.contactName}
                    onChange={(e) => patch('contactName', e.target.value)}
                    required
                  />
                </label>
                <label>
                  CEP
                  <input
                    value={form.zipCode}
                    onChange={(e) => {
                      const next = maskZip(e.target.value);
                      patch('zipCode', next);
                      if (onlyDigits(next).length === 8) void lookupCep(next);
                      else setCepStatus(null);
                    }}
                    onBlur={() => void lookupCep(form.zipCode)}
                    inputMode="numeric"
                    required
                  />
                  {cepStatus ? <span className="partner__hint">{cepStatus}</span> : null}
                </label>
                <label className="partner__span-2">
                  Endereço
                  <input
                    value={form.street}
                    onChange={(e) => patch('street', e.target.value)}
                    required
                  />
                </label>
                <label>
                  Número
                  <input value={form.number} onChange={(e) => patch('number', e.target.value)} required />
                </label>
                <label>
                  Bairro
                  <input
                    value={form.district}
                    onChange={(e) => patch('district', e.target.value)}
                    required
                  />
                </label>
                <label>
                  Cidade
                  <input value={form.city} onChange={(e) => patch('city', e.target.value)} required />
                </label>
                <AdminPicker
                  label="UF"
                  value={form.state}
                  options={BRAZIL_UFS.map((uf) => ({ value: uf, label: uf }))}
                  onChange={(val) => patch('state', val)}
                />
              </div>
            ) : (
              <div className="partner__review" style={{ marginTop: 16 }}>
                <article>
                  <h2>Empresa</h2>
                  <p>
                    <strong>{form.tradeName}</strong>
                    <br />
                    {form.legalName}
                    <br />
                    {form.documentType.toUpperCase()}: {form.document}
                  </p>
                </article>
              </div>
            )}

            <div className="partner__total">
              <span>
                Plano {selectedPlan.name} · mensalidade
              </span>
              <strong>
                {selectedPlan.price}
                {selectedPlan.period}
              </strong>
            </div>

            <div className="partner__pay">
              <h2>Forma de pagamento</h2>
              <div className="partner__doc-type" role="group" aria-label="Pagamento">
                <button
                  type="button"
                  className={payMethod === 'pix' ? 'is-active' : ''}
                  onClick={() => setPayMethod('pix')}
                >
                  PIX
                </button>
                <button
                  type="button"
                  className={payMethod === 'card' ? 'is-active' : ''}
                  onClick={() => setPayMethod('card')}
                >
                  Cartão
                </button>
              </div>
              {payMethod === 'pix' ? (
                <p className="partner__lead" style={{ marginTop: 12, marginBottom: 0 }}>
                  Ao confirmar, geramos um PIX (simulado nesta etapa) e liberamos o onboarding da
                  loja. Em produção o valor cai no gateway.
                </p>
              ) : (
                <div className="partner__grid" style={{ marginTop: 12 }}>
                  <label className="partner__span-2">
                    Nome no cartão
                    <input value={cardName} onChange={(e) => setCardName(e.target.value)} />
                  </label>
                  <label className="partner__span-2">
                    Número
                    <input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      inputMode="numeric"
                      placeholder="0000 0000 0000 0000"
                    />
                  </label>
                  <label>
                    Validade
                    <input
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="MM/AA"
                    />
                  </label>
                  <label>
                    CVV
                    <input
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="partner__footer">
          {step > 1 ? (
            <button type="button" className="btn btn--ghost" onClick={goBack} disabled={submitting}>
              Voltar
            </button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <button type="button" className="btn btn--primary" onClick={goNext}>
              Continuar
            </button>
          ) : (
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting
                ? 'Processando…'
                : `Pagar ${selectedPlan.price}${selectedPlan.period} e concluir`}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
