import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { StockSearchPicker } from '../../components/StockSearchPicker';
import type { StockItem } from '../../data/adminStore';
import { apiListStock } from '../../services/erpApi';
import { adsApi, formatMinor, type AdsAudience, type AdsCampaign, type AdsContent, type AdsCta, type AdsIssue, type AdsMedia } from '../../services/adsApi';
import { AdsPage, StatusChip, useAdsStatus } from './AdsShared';

const STEPS = ['Produto e variação', 'Objetivo e destino', 'Fotos, vídeo e texto', 'Público e posicionamentos', 'Orçamento e período', 'Conferir e enviar'];
const CTA_LABEL: Record<AdsCta, string> = { LEARN_MORE: 'Saiba mais', SHOP_NOW: 'Comprar agora', BUY_NOW: 'Comprar' };
const CONDITION_LABEL: Record<string, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };

const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (local: string) => (local ? new Date(local).toISOString() : '');

/** Assistente: produto → objetivo → conteúdo → público → orçamento → conferir e enviar (pausado). */
export function AdsCreatePage() {
  const { status } = useAdsStatus();
  const [params, setParams] = useSearchParams();
  const [step, setStep] = useState(() => Math.min(5, Math.max(0, Number(params.get('etapa') ?? 0))));
  const [campaign, setCampaign] = useState<AdsCampaign | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [productId, setProductId] = useState('');
  const [variationId, setVariationId] = useState('');
  const [content, setContent] = useState<AdsContent | null>(null);
  const [audience, setAudience] = useState<AdsAudience | null>(null);
  const [budget, setBudget] = useState({ budgetType: 'daily' as 'daily' | 'lifetime', amount: 20, start: '', end: '' });
  const [library, setLibrary] = useState<AdsMedia[]>([]);
  const [issues, setIssues] = useState<{ issues: AdsIssue[]; canSubmit: boolean } | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<Array<{ key: string; name: string }>>([]);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmSpend, setConfirmSpend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submitKey = useRef('');

  useEffect(() => {
    apiListStock()
      .then((rows) => setStock((Array.isArray(rows) ? rows : []).filter((item) => item.active !== false)))
      .catch(() => undefined);
    adsApi.media().then(setLibrary).catch(() => undefined);
  }, []);

  // Continuar um rascunho / corrigir uma campanha (?id=…).
  const campaignId = params.get('id');
  useEffect(() => {
    if (!campaignId) return;
    adsApi
      .campaign(campaignId)
      .then(adopt)
      .catch((err) => setError(err instanceof Error ? err.message : 'Campanha não encontrada.'));
  }, [campaignId]);

  function adopt(next: AdsCampaign) {
    setCampaign(next);
    setProductId(next.productId);
    setVariationId(next.variationId ?? '');
    setContent(next.content);
    setAudience(next.audience);
    setBudget({ budgetType: next.budgetType, amount: next.budgetMinor / 100, start: toLocalInput(next.startTime), end: toLocalInput(next.endTime) });
    if (!submitKey.current) submitKey.current = `${next.id}-${crypto.randomUUID()}`;
    if (!params.get('id')) setParams({ id: next.id }, { replace: true });
  }

  const product = stock.find((item) => item.id === productId) ?? null;
  const submitted = Boolean(campaign?.external?.ad_id);
  const locked = campaign?.submitState === 'submitting';

  async function run<T>(work: () => Promise<T>, done?: (value: T) => void) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const value = await work();
      done?.(value);
      return value;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function chooseProduct() {
    if (!product) return setError('Escolha o produto.');
    if ((product.variations?.length ?? 0) > 1 && !variationId) return setError('Escolha a variação que será anunciada.');
    if (campaign && campaign.productId === product.id && (campaign.variationId ?? '') === variationId) return setStep(1);
    if (submitted) return setError('Esta campanha já foi enviada: para outro produto, crie um anúncio novo.');
    const created = await run(() => adsApi.createDraft({ productId: product.id, variationId: variationId || null }));
    if (created) {
      submitKey.current = '';
      adopt(created);
      setStep(1);
    }
  }

  async function saveContent(next = step + 1) {
    if (!campaign || !content) return;
    const saved = await run(() => adsApi.updateDraft(campaign.id, { content }));
    if (saved) {
      adopt(saved);
      setStep(next);
    }
  }

  async function saveAudience() {
    if (!campaign || !audience) return;
    if (submitted) return setStep(4);
    const saved = await run(() => adsApi.updateDraft(campaign.id, { audience }));
    if (saved) {
      adopt(saved);
      setStep(4);
    }
  }

  async function saveBudget() {
    if (!campaign) return;
    if (submitted) return setStep(5);
    const startTime = fromLocalInput(budget.start) || new Date(Date.now() + 3600_000).toISOString();
    const saved = await run(() =>
      adsApi.updateDraft(campaign.id, {
        budget: { budgetType: budget.budgetType, budgetMinor: Math.round(budget.amount * 100), startTime, endTime: budget.end ? fromLocalInput(budget.end) : null },
      }),
    );
    if (saved) {
      adopt(saved);
      setStep(5);
    }
  }

  // Conferência sempre que chega na última etapa.
  useEffect(() => {
    if (step !== 5 || !campaign) return;
    adsApi.validation(campaign.id).then(setIssues).catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível conferir.'));
  }, [step, campaign?.id, campaign?.content, campaign?.budgetMinor]);

  async function submit() {
    if (!campaign || !confirmSend) return;
    if (!submitKey.current) submitKey.current = `${campaign.id}-${crypto.randomUUID()}`;
    const result = await run(() => adsApi.submit(campaign.id, submitKey.current));
    if (result) {
      adopt(result);
      setNotice('Enviado para a Meta. A campanha foi criada PAUSADA — nada é gasto até você autorizar o orçamento.');
    }
  }

  async function resubmit() {
    if (!campaign || !content) return;
    const saved = await run(() => adsApi.updateDraft(campaign.id, { content }));
    if (!saved) return;
    const result = await run(() => adsApi.resubmit(campaign.id));
    if (result) {
      adopt(result);
      setNotice('Anúncio corrigido e reenviado. Ele volta para a análise da Meta.');
    }
  }

  async function activate() {
    if (!campaign || !confirmSpend) return;
    const result = await run(() => adsApi.activate(campaign.id, campaign.budgetMinor));
    if (result) {
      adopt(result);
      setNotice('Orçamento autorizado. A Meta começa a veicular quando o anúncio for aprovado.');
    }
  }

  async function searchCity() {
    if (cityQuery.trim().length < 2) return;
    const result = await run(() => adsApi.cities(cityQuery.trim()));
    if (result) setCityResults(result);
  }

  const offer = campaign?.offer ?? null;
  const mediaOptions = useMemo(() => {
    const productImages = (offer?.images ?? []).map((src, index) => ({ key: `p${index}`, media: { source: 'product' as const, index }, preview: src, label: `Foto ${index + 1} do produto`, kind: 'image' as const }));
    const fromLibrary = library
      .filter((item) => item.kind === 'image' || item.status === 'ready')
      .map((item) => ({ key: item.id, media: { source: 'library' as const, mediaId: item.id }, preview: item.preview ?? '', label: item.name, kind: item.kind }));
    return [...productImages, ...fromLibrary];
  }, [offer?.images, library]);
  const selectedMedia = mediaOptions.find((option) =>
    content?.media.source === 'product' ? option.media.source === 'product' && option.media.index === (content.media.index ?? 0) : option.key === content?.media.mediaId,
  );

  const canGo = (index: number) => index === 0 || Boolean(campaign);
  return (
    <AdsPage title="Criar anúncio" lead="Anuncie um produto do seu cadastro no Facebook em 6 passos. A campanha é criada pausada; só roda quando você autorizar o orçamento." status={status}>
      <ol className="ads-steps">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'is-current' : index < step && campaign ? 'is-done' : ''}>
            <button type="button" disabled={!canGo(index)} onClick={() => canGo(index) && setStep(index)}>
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      {error ? <p className="ads-error">{error}</p> : null}
      {notice ? <p className="ads-ok">{notice}</p> : null}
      {campaign ? (
        <p className="ads-note">
          Campanha: <strong>{campaign.name}</strong> · <StatusChip display={campaign.display} />
        </p>
      ) : null}

      {step === 0 ? (
        <article className="admin-card">
          <h2 className="ads-card-title">Qual produto você quer anunciar?</h2>
          <div className="ads-form">
            <div className="is-wide">
              <StockSearchPicker
                label="Produto"
                items={stock}
                selected={product}
                describe={(item) => `${item.variations?.length ? `${item.variations.length} variações · ` : ''}${(item.price ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                onSelect={(pick) => {
                  setProductId(pick.product.id);
                  setVariationId(pick.variation?.id ?? (pick.product.variations?.length === 1 ? pick.product.variations[0].id ?? '' : ''));
                }}
                onClear={() => {
                  setProductId('');
                  setVariationId('');
                }}
              />
            </div>
            {product && (product.variations?.length ?? 0) > 0 ? (
              <div className="is-wide">
                <AdminPicker
                  label="Variação anunciada (preço e condição desta opção)"
                  value={variationId}
                  placeholder="Escolha a variação"
                  options={(product.variations ?? []).map((v) => ({
                    value: v.id ?? '',
                    label: `${Object.values(v.attrs ?? {}).filter(Boolean).join(' · ')} · ${CONDITION_LABEL[v.condition] ?? v.condition}${v.batteryLevel != null && v.condition !== 'new' ? ` · bateria ${v.batteryLevel}%` : ''} · ${(Number(v.price) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${v.qty} em estoque`,
                  }))}
                  onChange={setVariationId}
                />
              </div>
            ) : null}
          </div>
          <p className="ads-note">O anúncio usa nome, fotos, preço, condição e formas de retirada do cadastro. Você pode editar o texto sem mudar o cadastro. IMEI, custo, margem e fornecedor nunca aparecem.</p>
          <div className="ads-actions">
            <span />
            <button type="button" className="btn btn--primary" disabled={busy || !product} onClick={() => void chooseProduct()}>
              Continuar
            </button>
          </div>
        </article>
      ) : null}

      {step === 1 && campaign ? (
        <article className="admin-card">
          <h2 className="ads-card-title">O que você quer com o anúncio?</h2>
          <ul className="ads-checks">
            <li className="is-ok">
              <span className="ads-checks__icon">●</span>
              <span>
                <strong>Levar pessoas para a página do produto (Tráfego)</strong>
                <small>Quem clicar vê fotos, preço, condição e como comprar/retirar. Destino: {campaign.destinationUrl}</small>
              </span>
            </li>
            <li>
              <span className="ads-checks__icon">○</span>
              <span>
                <strong>Receber mensagens no WhatsApp/Messenger</strong>
                <small>Ainda não disponível: depende de configurar e validar o destino de mensagens.</small>
              </span>
            </li>
            <li>
              <span className="ads-checks__icon">○</span>
              <span>
                <strong>Vendas / conversões</strong>
                <small>Ainda não disponível: exige rastreamento de eventos (pixel/Conversions API) configurado e validado.</small>
              </span>
            </li>
          </ul>
          <div className="ads-actions">
            <a className="btn btn--ghost" href={campaign.destinationUrl} target="_blank" rel="noreferrer">
              Ver a página do produto
            </a>
            <button type="button" className="btn btn--primary" onClick={() => setStep(2)}>
              Continuar
            </button>
          </div>
        </article>
      ) : null}

      {step === 2 && campaign && content ? (
        <div className="ads-grid">
          <article className="admin-card">
            <h2 className="ads-card-title">Foto ou vídeo</h2>
            <div className="ads-media-grid">
              {mediaOptions.map((option) => (
                <button key={option.key} type="button" className={`ads-media-item ${selectedMedia?.key === option.key ? 'is-selected' : ''}`} onClick={() => setContent({ ...content, media: option.media })}>
                  {option.preview ? <img src={option.preview} alt="" /> : <span className="ads-media-ph">{option.kind === 'video' ? 'Vídeo' : 'Sem prévia'}</span>}
                  <small>{option.label}</small>
                </button>
              ))}
            </div>
            <p className="ads-note">
              Envie outras fotos ou vídeos em <Link to="/painel/ads/midias">Fotos e vídeos</Link>. Use só mídias que você tem direito de usar.
            </p>
            <h2 className="ads-card-title" style={{ marginTop: 14 }}>
              Texto
            </h2>
            <div className="ads-form">
              <label className="is-wide">
                Título ({content.headline.length}/40 recomendados)
                <input value={content.headline} maxLength={255} onChange={(e) => setContent({ ...content, headline: e.target.value })} />
              </label>
              <label className="is-wide">
                Texto do anúncio ({content.message.length}/150 recomendados)
                <textarea value={content.message} maxLength={2000} onChange={(e) => setContent({ ...content, message: e.target.value })} />
              </label>
              <label>
                Descrição curta
                <input value={content.description} maxLength={255} onChange={(e) => setContent({ ...content, description: e.target.value })} />
              </label>
              <AdminPicker
                label="Botão"
                value={content.cta}
                options={(Object.keys(CTA_LABEL) as AdsCta[]).map((cta) => ({ value: cta, label: CTA_LABEL[cta] }))}
                onChange={(cta) => setContent({ ...content, cta: cta as AdsCta })}
              />
            </div>
            <p className="ads-note">Evite promessas que a página do produto não mostra, preços diferentes do anunciado e texto em excesso na imagem — a Meta analisa todo anúncio e pode reprovar.</p>
          </article>
          <article className="admin-card">
            <h2 className="ads-card-title">Prévia no Feed do Facebook</h2>
            <AdPreview pageName={status?.connection?.page?.name || offer?.store.name || 'Sua Página'} logo={offer?.store.logo ?? null} content={content} mediaSrc={selectedMedia?.preview ?? ''} link={campaign.destinationUrl} />
            <p className="ads-note">Prévia aproximada. A Meta pode ajustar o corte da imagem conforme o aparelho.</p>
          </article>
          <div className="ads-actions is-wide" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
              Voltar
            </button>
            {submitted ? (
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void resubmit()}>
                Corrigir e reenviar para a Meta
              </button>
            ) : (
              <button type="button" className="btn btn--primary" disabled={busy || locked} onClick={() => void saveContent()}>
                Salvar e continuar
              </button>
            )}
          </div>
        </div>
      ) : null}

      {step === 3 && campaign && audience ? (
        <article className="admin-card">
          <h2 className="ads-card-title">Quem vai ver o anúncio</h2>
          {submitted ? <p className="ads-note">A campanha já foi enviada: público e período não mudam mais pelo Marthi.</p> : null}
          <div className="ads-form">
            <div className="is-wide">
              <span className="ads-note">Onde: {audience.cities.length ? 'nas cidades escolhidas' : 'todo o Brasil'}</span>
              <div className="ads-chip-list" style={{ marginTop: 6 }}>
                {audience.cities.map((city) => (
                  <button key={city.key} type="button" disabled={submitted} onClick={() => setAudience({ ...audience, cities: audience.cities.filter((c) => c.key !== city.key) })}>
                    {city.name} ×
                  </button>
                ))}
              </div>
            </div>
            {!submitted ? (
              <label className="is-wide">
                Buscar cidade
                <span style={{ display: 'flex', gap: 8 }}>
                  <input value={cityQuery} placeholder="Ex.: Volta Redonda" onChange={(e) => setCityQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void searchCity())} />
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void searchCity()}>
                    Buscar
                  </button>
                </span>
              </label>
            ) : null}
            {cityResults.length && !submitted ? (
              <div className="is-wide ads-chip-list">
                {cityResults.map((city) => (
                  <button
                    key={city.key}
                    type="button"
                    onClick={() => {
                      if (!audience.cities.some((c) => c.key === city.key)) setAudience({ ...audience, cities: [...audience.cities, city] });
                      setCityResults([]);
                      setCityQuery('');
                    }}
                  >
                    + {city.name}
                  </button>
                ))}
              </div>
            ) : null}
            <label>
              Idade mínima
              <input type="number" min={18} max={65} disabled={submitted} value={audience.ageMin} onChange={(e) => setAudience({ ...audience, ageMin: Math.max(18, Math.min(65, Number(e.target.value) || 18)) })} />
            </label>
            <label>
              Idade máxima
              <input type="number" min={18} max={65} disabled={submitted} value={audience.ageMax} onChange={(e) => setAudience({ ...audience, ageMax: Math.max(18, Math.min(65, Number(e.target.value) || 65)) })} />
            </label>
          </div>
          <h2 className="ads-card-title" style={{ marginTop: 14 }}>
            Onde aparece
          </h2>
          <ul className="ads-checks">
            <li className="is-ok">
              <span className="ads-checks__icon">✓</span>
              <span>
                <strong>Feed do Facebook</strong>
              </span>
            </li>
            <li>
              <span className="ads-checks__icon">○</span>
              <span>
                <strong>Instagram (Feed, Stories, Reels)</strong>
                <small>Chega na Fase 3, depois de validar os anúncios no Facebook.</small>
              </span>
            </li>
          </ul>
          <div className="ads-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>
              Voltar
            </button>
            <button type="button" className="btn btn--primary" disabled={busy || locked} onClick={() => void saveAudience()}>
              {submitted ? 'Continuar' : 'Salvar e continuar'}
            </button>
          </div>
        </article>
      ) : null}

      {step === 4 && campaign ? (
        <article className="admin-card">
          <h2 className="ads-card-title">Quanto investir e por quanto tempo</h2>
          <div className="ads-form">
            <AdminPicker
              label="Tipo de orçamento"
              value={budget.budgetType}
              disabled={submitted}
              options={[
                { value: 'daily', label: 'Por dia (gasto médio diário)' },
                { value: 'lifetime', label: 'Total do período' },
              ]}
              onChange={(value) => setBudget({ ...budget, budgetType: value === 'lifetime' ? 'lifetime' : 'daily' })}
            />
            <label>
              Valor ({campaign.currency})
              <CurrencyInput value={budget.amount} ariaLabel="Orçamento" onChange={(amount) => !submitted && setBudget({ ...budget, amount })} />
            </label>
            <label>
              Início
              <input type="datetime-local" disabled={submitted} value={budget.start} onChange={(e) => setBudget({ ...budget, start: e.target.value })} />
            </label>
            <label>
              Término {budget.budgetType === 'lifetime' ? '(obrigatório)' : '(opcional)'}
              <input type="datetime-local" disabled={submitted} value={budget.end} onChange={(e) => setBudget({ ...budget, end: e.target.value })} />
            </label>
          </div>
          <p className="ads-note">
            Quem cobra é a Meta, direto na forma de pagamento da sua conta de anúncios ({status?.connection?.adAccount?.name || 'conta escolhida em Contas conectadas'}). A Meta tem um orçamento mínimo por moeda e pode gastar um pouco
            acima do valor diário em alguns dias, mantendo a média; se o valor estiver abaixo do mínimo, ela recusa e o Marthi mostra o motivo.
          </p>
          <div className="ads-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(3)}>
              Voltar
            </button>
            <button type="button" className="btn btn--primary" disabled={busy || locked || !(budget.amount > 0)} onClick={() => void saveBudget()}>
              {submitted ? 'Continuar' : 'Salvar e continuar'}
            </button>
          </div>
        </article>
      ) : null}

      {step === 5 && campaign ? (
        <div className="ads-grid">
          <article className="admin-card ads-detail">
            <h2 className="ads-card-title">Conferir</h2>
            <p>
              <strong>{campaign.content.headline}</strong>
              <br />
              {offer ? `${offer.conditionLabel} · ${offer.priceLabel}${offer.batteryLevel != null ? ` · bateria ${offer.batteryLevel}%` : ''}` : ''}
            </p>
            <p className="ads-note">
              Público: {campaign.audience.cities.length ? campaign.audience.cities.map((c) => c.name).join(', ') : 'todo o Brasil'} · {campaign.audience.ageMin}–{campaign.audience.ageMax} anos · Feed do Facebook
            </p>
            <p className="ads-note">
              Orçamento: {formatMinor(campaign.budgetMinor, campaign.currency)} {campaign.budgetType === 'daily' ? 'por dia' : 'no total'} · de {campaign.startTime ? new Date(campaign.startTime).toLocaleString('pt-BR') : '—'}
              {campaign.endTime ? ` até ${new Date(campaign.endTime).toLocaleString('pt-BR')}` : ' sem data de término'}
            </p>
            {issues ? (
              issues.issues.length ? (
                <ul className="ads-issues">
                  {issues.issues.map((issue, index) => (
                    <li key={index} className={`is-${issue.level}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ads-ok">Nenhum problema encontrado pelo Marthi. A aprovação final é da Meta.</p>
              )
            ) : (
              <p className="empty">Conferindo…</p>
            )}
            {!submitted ? (
              <>
                <label className="ads-check">
                  <input type="checkbox" checked={confirmSend} onChange={(e) => setConfirmSend(e.target.checked)} />
                  Enviar para a Meta. A campanha será criada PAUSADA e nada será gasto até a autorização do orçamento.
                </label>
                <div className="ads-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setStep(4)}>
                    Voltar
                  </button>
                  <button type="button" className="btn btn--primary" disabled={busy || locked || !confirmSend || !issues?.canSubmit} onClick={() => void submit()}>
                    {busy ? 'Enviando…' : campaign.submitState === 'error' ? 'Tentar enviar de novo' : 'Enviar para a Meta'}
                  </button>
                </div>
              </>
            ) : null}
          </article>

          {submitted ? (
            <article className="admin-card ads-detail">
              <h2 className="ads-card-title">Autorizar o orçamento</h2>
              <p>
                Situação na Meta: <StatusChip display={campaign.display} />
              </p>
              {campaign.requestedStatus === 'active' ? (
                <p className="ads-ok">Orçamento autorizado por {campaign.authorizedBy}. Acompanhe em Campanhas.</p>
              ) : status?.canAdmin ? (
                <>
                  <label className="ads-check">
                    <input type="checkbox" checked={confirmSpend} onChange={(e) => setConfirmSpend(e.target.checked)} />
                    Autorizo gastar até {formatMinor(campaign.budgetMinor, campaign.currency)} {campaign.budgetType === 'daily' ? 'por dia (média)' : 'no total'} na minha conta de anúncios da Meta.
                  </label>
                  <div className="ads-actions">
                    <span />
                    <button type="button" className="btn btn--primary" disabled={busy || !confirmSpend} onClick={() => void activate()}>
                      Autorizar e ativar
                    </button>
                  </div>
                </>
              ) : (
                <p className="ads-note">Só o administrador da loja autoriza gastos. Peça a ele para ativar em Campanhas.</p>
              )}
              <Link to="/painel/ads/campanhas">Ver em Campanhas</Link>
            </article>
          ) : null}
        </div>
      ) : null}
    </AdsPage>
  );
}

function AdPreview({ pageName, logo, content, mediaSrc, link }: { pageName: string; logo: string | null; content: AdsContent; mediaSrc: string; link: string }) {
  const host = (() => {
    try {
      return new URL(link).host.toUpperCase();
    } catch {
      return '';
    }
  })();
  return (
    <div className="ads-preview">
      <div className="ads-preview__head">
        <span className="ads-preview__avatar">{logo ? <img src={logo} alt="" /> : pageName.slice(0, 1)}</span>
        <span>
          <strong>{pageName}</strong>
          <small>Patrocinado</small>
        </span>
      </div>
      <div className="ads-preview__text">{content.message}</div>
      <div className="ads-preview__media is-square">{mediaSrc ? <img src={mediaSrc} alt="" /> : <div style={{ aspectRatio: '1' }} />}</div>
      <div className="ads-preview__link">
        <span>
          <small>{host}</small>
          <strong>{content.headline}</strong>
        </span>
        <span className="ads-preview__cta">{CTA_LABEL[content.cta]}</span>
      </div>
    </div>
  );
}
