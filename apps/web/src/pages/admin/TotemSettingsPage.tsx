import {TotemSettingToggle,TotemSettingsImage,TotemSettingsBanners,TotemSettingsGroup} from './TotemSettingsControls';
import { AdminIcon } from '../../components/AdminIcons';
import { CurrencyInput } from '../../components/CurrencyInput';
import {assistantText} from '../../data/totemAssistant';
import './totemSettings.css';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {apiListSellers,type ApiSeller} from '../../services/erpApi';
import { TotemAttractScene } from '../totem/TotemAttractScene';
import { TotemRigPreview } from './TotemRigPreview';
import { AdminPicker } from '../../components/AdminPicker';
import {
  ATTRACT_COLOR_PRESETS,
  fileToAttractBackground,
  fileToStoreLogo,
  getTotemSettings,
  hydrateTotemSettingsFromApi,
  saveTotemSettings,
  storeGreeting,
  totemCopy,
  verticalPreset,
  TOTEM_VERTICALS,
  TOTEM_MAX_TOP_BANNERS,
  type TotemAttractLayout,
  type TotemColumns,
  type TotemKeyboardPlacement,
  type TotemMode,
  type TotemVertical,
} from '../../data/totemSettings';

const MODES: { id: TotemMode; title: string; text: string }[] = [
  {
    id: 'kiosk',
    title: 'Quiosque de venda',
    text: 'O cliente escolhe, confirma e o pedido cai na fila da loja.',
  },
  {
    id: 'catalog',
    title: 'Catálogo',
    text: 'Só vitrine: o cliente navega, sem pedido, ticket ou tela de nome. Como hoje.',
  },
];

const KEYBOARD_OPTIONS: {
  id: TotemKeyboardPlacement;
  title: string;
  text: string;
}[] = [
  {
    id: 'top',
    title: 'Totem grande / de pé',
    text: 'Tela alta. Teclado no topo: o braço alcança na altura do peito, sem abaixar.',
  },
  {
    id: 'bottom',
    title: 'Totem na cintura / balcão',
    text: 'Tela mais baixa. Teclado embaixo: o ângulo de visão e as mãos ficam naturais.',
  },
];

const COLUMN_OPTIONS: { id: TotemColumns; title: string; text: string }[] = [
  { id: 1, title: '1 por linha', text: 'Card grande. Ótica, joia, vitrine de destaque.' },
  { id: 2, title: '2 por linha', text: 'Padrão. Bom equilíbrio entre foto e quantidade.' },
  { id: 3, title: '3 por linha', text: 'Lanchonete, cafeteria, mix médio de produtos.' },
  { id: 4, title: '4 por linha', text: 'Livraria, papelaria, muitos SKUs na mesma tela.' },
];

export function TotemSettingsPage() {
  const initial = getTotemSettings();
  const [vertical, setVertical] = useState<TotemVertical>(() => initial.vertical);
  const [mode, setMode] = useState<TotemMode>(() => initial.mode);
  const [exitPassword, setExitPassword] = useState(() => initial.exitPassword);
  const [confirmPassword, setConfirmPassword] = useState(() => initial.exitPassword);
  const [columns, setColumns] = useState<TotemColumns>(() => initial.columns);
  const [askCustomerName, setAskCustomerName] = useState(() => initial.askCustomerName);
  const [showAttractScreen, setShowAttractScreen] = useState(() => initial.showAttractScreen);
  const [showActionButtons, setShowActionButtons] = useState(
    () => initial.showActionButtons !== false,
  );
  const [customGreetingText, setCustomGreetingText] = useState(
    () => initial.customGreetingText || '',
  );
  const [customSubtitleText, setCustomSubtitleText] = useState(
    () => initial.customSubtitleText || '',
  );
  const [storeName, setStoreName] = useState(() => initial.storeName);
  const [headerSubtitle, setHeaderSubtitle] = useState(() => initial.headerSubtitle || '');
  const [storeLogo, setStoreLogo] = useState(() => initial.storeLogo);
  const [attractBackground, setAttractBackground] = useState(() => initial.attractBackground);
  const [attractGradientColor, setAttractGradientColor] = useState(() => initial.attractGradientColor);
  const [attractLayout, setAttractLayout] = useState<TotemAttractLayout>(() => initial.attractLayout);
  const [attractContent,setAttractContent]=useState(initial.attractContent);
  const [assistant,setAssistant]=useState(initial.assistant);
  const [exampleName,setExampleName]=useState('Ana Paula');
  const [assistantSellers,setAssistantSellers]=useState<ApiSeller[]>([]);
  useEffect(()=>{let active=true;void apiListSellers(true).then(rows=>{if(active)setAssistantSellers(rows);}).catch(()=>{});return()=>{active=false;};},[]);
  const [keyboardPlacement, setKeyboardPlacement] = useState<TotemKeyboardPlacement>(
    () => initial.keyboardPlacement,
  );
  const [offerFulfillment, setOfferFulfillment] = useState(() => initial.offerFulfillment);
  const [printTicket, setPrintTicket] = useState(() => initial.printTicket);
  const [audioAssist, setAudioAssist] = useState(() => initial.audioAssist);
  const [storeWhatsApp, setStoreWhatsApp] = useState(() => initial.storeWhatsApp);
  const [notifyCustomerOnLead, setNotifyCustomerOnLead] = useState(
    () => initial.notifyCustomerOnLead,
  );
  const [locationLabel, setLocationLabel] = useState(() => initial.locationLabel);
  const [cardFeePercent, setCardFeePercent] = useState(() => initial.cardFeePercent ?? 0);
  const [customerWhatsAppMessage, setCustomerWhatsAppMessage] = useState(() => initial.customerWhatsAppMessage);
  const [theme, setTheme] = useState(() => initial.theme);
  const [catalogNav, setCatalogNav] = useState(() => initial.catalogNav);
  const [navGroup, setNavGroup] = useState(() => initial.navGroup);
  const [topBanners, setTopBanners] = useState(() => initial.topBanners);
  const [cartEnabled, setCartEnabled] = useState(() => initial.cartEnabled);
  const [whatsAppCheckout, setWhatsAppCheckout] = useState(() => initial.whatsAppCheckout);
  const [checkoutGesture, setCheckoutGesture] = useState(() => initial.checkoutGesture);
  const [loadingSettings,setLoadingSettings]=useState(true);
  const [settingsLoadError,setSettingsLoadError]=useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(()=>setSaved(false),[assistant,attractContent,customerWhatsAppMessage,theme,catalogNav,navGroup,topBanners,cartEnabled,checkoutGesture,whatsAppCheckout]);

  useEffect(() => {
    let mounted = true;
    hydrateTotemSettingsFromApi()
      .then((s) => {
        if (!mounted) return;
        setVertical(s.vertical);
        setMode(s.mode);
        setExitPassword(s.exitPassword);
        setConfirmPassword(s.exitPassword);
        setColumns(s.columns);
        setShowAttractScreen(s.showAttractScreen);
        setShowActionButtons(s.showActionButtons !== false);
        setCustomGreetingText(s.customGreetingText || '');
        setCustomSubtitleText(s.customSubtitleText || '');
        setStoreName(s.storeName);
        setHeaderSubtitle(s.headerSubtitle || '');
        setStoreLogo(s.storeLogo);
        setAttractBackground(s.attractBackground);
        setAttractGradientColor(s.attractGradientColor);
        setAttractLayout(s.attractLayout);
        setAttractContent(s.attractContent);setAssistant(s.assistant);
        setKeyboardPlacement(s.keyboardPlacement);
        setAskCustomerName(s.askCustomerName);
        setOfferFulfillment(s.offerFulfillment);
        setPrintTicket(s.printTicket);
        setAudioAssist(s.audioAssist);
        setStoreWhatsApp(s.storeWhatsApp);
        setNotifyCustomerOnLead(s.notifyCustomerOnLead);
        setLocationLabel(s.locationLabel);
        setCardFeePercent(s.cardFeePercent ?? 0);
        setCustomerWhatsAppMessage(s.customerWhatsAppMessage);
        setTheme(s.theme);
        setCatalogNav(s.catalogNav);
        setNavGroup(s.navGroup);
        setTopBanners(s.topBanners);
        setCartEnabled(s.cartEnabled);
        setWhatsAppCheckout(s.whatsAppCheckout);
        setCheckoutGesture(s.checkoutGesture);
      })
      .catch((err) => {
        if(mounted){setSettingsLoadError(true);setError(err instanceof Error?err.message:'Não foi possível carregar as configurações salvas.');}
      }).finally(()=>{if(mounted)setLoadingSettings(false);});
    return () => {
      mounted = false;
    };
  }, []);

  const copy = totemCopy(vertical);
  const catalogOnly = mode === 'catalog';

  function markDirty() {
    setSaved(false);
    setError(null);
  }

  function applyVertical(id: TotemVertical) {
    const preset = verticalPreset(id);
    setVertical(id);
    setMode(preset.mode);
    setColumns(preset.columns);
    setShowAttractScreen(preset.showAttractScreen);
    setAskCustomerName(preset.askCustomerName);
    setOfferFulfillment(preset.offerFulfillment);
    setPrintTicket(preset.printTicket);
    setAudioAssist(preset.audioAssist);
    setKeyboardPlacement(preset.keyboardPlacement);
    setAttractGradientColor(preset.attractGradientColor);
    markDirty();
  }

  // Tudo o que vai para o banco. Serve para salvar e para saber se há alteração pendente.
  const settingsPayload = {
        vertical,
        mode,
        exitPassword: exitPassword.trim(),
        shareStockWithErp: true,
        columns,
        showAttractScreen,
        showActionButtons,
        customGreetingText,
        customSubtitleText,
        storeName,
        headerSubtitle,
        storeLogo,
        attractBackground,
        attractGradientColor,
        attractLayout,
        attractContent,assistant,
        keyboardPlacement,
        askCustomerName,
        offerFulfillment,
        printTicket,
        audioAssist,
        storeWhatsApp,
        notifyCustomerOnLead,
        locationLabel,
        cardFeePercent,
        customerWhatsAppMessage,
        theme,
        catalogNav,
        navGroup,
        topBanners,
        cartEnabled,
        whatsAppCheckout,
        checkoutGesture,
  };
  // Imagens viram uma impressão curta (tamanho + pontas) para comparar sem copiar megabytes.
  const snapshot = JSON.stringify(settingsPayload, (_key, value) =>
    typeof value === 'string' && value.length > 2000 ? `${value.length}:${value.slice(0, 64)}:${value.slice(-64)}` : value,
  );
  const [baseline, setBaseline] = useState<string | null>(null);
  useEffect(() => {
    if (!loadingSettings && !settingsLoadError && baseline === null) setBaseline(snapshot);
  }, [loadingSettings, settingsLoadError, baseline, snapshot]);
  const dirty = baseline !== null && snapshot !== baseline;
  const [saving, setSaving] = useState(false);

  const GROUP_IDS = ['totem-group-visual', 'totem-group-display', 'totem-group-images', 'totem-group-messages', 'totem-group-sales'];
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const allGroupsOpen = openGroups.length === GROUP_IDS.length;
  function toggleGroup(id: string) {
    setOpenGroups((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }
  function toggleAllGroups() {
    setOpenGroups(allGroupsOpen ? [] : GROUP_IDS);
  }
  function revealGroup(id: string) {
    setOpenGroups((current) => (current.includes(id) ? current : [...current, id]));
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  // Avisa antes de sair da página com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    const next = exitPassword.trim();
    if (next.length < 4) {
      setError('A senha de saída precisa ter pelo menos 4 caracteres.');
      setSaved(false);
      revealGroup('totem-group-sales');
      return;
    }
    if (next !== confirmPassword.trim()) {
      setError('A confirmação da senha de saída não confere.');
      setSaved(false);
      revealGroup('totem-group-sales');
      return;
    }
    setSaving(true);
    try {
      await saveTotemSettings(settingsPayload);
      setError(null);
      setSaved(true);
      setBaseline(snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  if(loadingSettings||settingsLoadError)return <section className="admin-page totem-settings-page"><article className="admin-card"><h1>Configurações do totem</h1><p role="status">{loadingSettings?'Carregando suas configurações salvas…':error}</p>{settingsLoadError?<button className="btn btn--primary" onClick={()=>window.location.reload()}>Tentar novamente</button>:null}</article></section>;

  return (
    <section className="admin-page totem-settings-page">
      <div className="totem-settings-savebar" role="region" aria-label="Salvar configurações do totem">
        <div className="totem-settings-savebar__title">
          <h1>Configurações do totem</h1>
          <p role="status" className={`totem-settings-savebar__status${error ? ' is-error' : dirty ? ' is-dirty' : saved ? ' is-saved' : ''}`}>
            {error ? error : saving ? 'Salvando…' : dirty ? '● Há alterações não salvas' : saved ? '✓ Configurações salvas no banco de dados' : 'Tudo salvo'}
          </p>
        </div>
        <div className="totem-settings-savebar__actions">
          <button type="button" className="totem-settings-pill" onClick={toggleAllGroups}>
            <AdminIcon name={allGroupsOpen ? 'collapse' : 'expand'} />
            <span>{allGroupsOpen ? 'Inibir tudo' : 'Exibir tudo'}</span>
          </button>
          <Link to="/painel/totem/previa" className="btn btn--ghost btn--sm">Visualizar totem</Link>
          <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      </div>
      <p className="totem-settings-intro">Escolha a aparência, personalize a conversa e indique quem receberá os pedidos. Preços, ofertas e dados fiscais ficam no cadastro de produtos.</p>
      <TotemSettingsGroup id="totem-group-visual" icon="🎨" title="Configurações visuais" hint="Tema claro ou escuro, navegação da vitrine e quantos cards por linha." open={openGroups.includes('totem-group-visual')} onToggle={() => toggleGroup('totem-group-visual')}>
        <article className="admin-card" id="totem-theme">
          <h2>Tema e navegação da vitrine</h2>
          <p>Tudo opcional: sem mudar nada, o totem continua exatamente como está hoje.</p>
          <h3 className="totem-settings-subtitle">Tema</h3>
          <div className="plan-picker">
            {([
              { value: 'light', title: 'Claro', hint: 'Fundo claro e limpo, ótimo para lojas bem iluminadas.' },
              { value: 'dark', title: 'Escuro', hint: 'Fundo escuro elegante; as fotos dos produtos ganham destaque.' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`plan-picker__card ${theme === option.value ? 'is-active' : ''}`}
                onClick={() => {
                  setTheme(option.value);
                  markDirty();
                }}
              >
                <strong>{option.title}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>

          <h3 className="totem-settings-subtitle">Navegação da vitrine</h3>
          <div className="plan-picker">
            {([
              { value: 'top', title: 'Abas no topo', hint: 'Marcas ou categorias em botões acima dos produtos (como hoje).' },
              { value: 'sidebar', title: 'Barra lateral', hint: 'Lista fixa à esquerda com foto de cada grupo, como nos totens de lanchonete.' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`plan-picker__card ${catalogNav === option.value ? 'is-active' : ''}`}
                onClick={() => {
                  setCatalogNav(option.value);
                  markDirty();
                }}
              >
                <strong>{option.title}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>
          <div className="plan-picker" style={{ marginTop: 12 }}>
            {([
              { value: 'brand', title: 'Agrupar por marca', hint: 'Ideal para celulares e eletrônicos: Apple, Samsung, Xiaomi…' },
              { value: 'category', title: 'Agrupar por categoria', hint: 'Usa a categoria do estoque: lanches, bebidas, sobremesas, acessórios…' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`plan-picker__card ${navGroup === option.value ? 'is-active' : ''}`}
                onClick={() => {
                  setNavGroup(option.value);
                  markDirty();
                }}
              >
                <strong>{option.title}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>

        </article>
        <article className="admin-card">
          <h2>Cards por linha</h2>
          <p>
            Quantos produtos aparecem lado a lado. O desenho abaixo acompanha a escolha, no ramo{' '}
            {TOTEM_VERTICALS.find((item) => item.id === vertical)?.title.toLowerCase()}.
          </p>
          <div className="plan-picker plan-picker--four">
            {COLUMN_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`plan-picker__card ${columns === item.id ? 'is-active' : ''}`}
                onClick={() => {
                  setColumns(item.id);
                  markDirty();
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>

          <div className="totem-preview" aria-label="Pré-visualização dos cards">
            <div className="totem-preview__bar">
              <span>Pré-visualização</span>
              <strong>
                {columns} {columns === 1 ? 'card' : 'cards'} por linha
                {catalogOnly ? ' · catálogo' : ''}
              </strong>
            </div>
            {askCustomerName && !catalogOnly ? (
              <p className="totem-preview__note">
                O cliente informa o nome nesta abertura, só para o ticket de aguarde.
              </p>
            ) : null}
            <div
              className="totem-preview__grid"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {copy.previewItems.map((item) => (
                <article key={item.name} className="totem-preview__card">
                  <div className="totem-preview__media" />
                  <strong>{item.name}</strong>
                  {offerFulfillment && !catalogOnly ? <em>Consumir no local · Retirada</em> : null}
                  <span>{item.price}</span>
                </article>
              ))}
            </div>
            {!catalogOnly && (printTicket || audioAssist) ? (
              <p className="totem-preview__note" style={{ marginTop: 12, marginBottom: 0 }}>
                {printTicket ? 'No fim do pedido o totem imprime a senha. ' : ''}
                {audioAssist ? 'Há voz em português para acessibilidade.' : ''}
              </p>
            ) : null}
          </div>
        </article>
      </TotemSettingsGroup>
      <TotemSettingsGroup id="totem-group-display" icon="🖥️" title="Configurações de exibição" hint="Ramo da loja, modo do totem, equipamento e teclado, fluxo do cliente, carrinho e acessibilidade." open={openGroups.includes('totem-group-display')} onToggle={() => toggleGroup('totem-group-display')}>
        <article className="admin-card">
          <h2>Ramo da loja</h2>
          <p>
            É a base do totem. Cada ramo já sugere colunas, tela de nome, retirada, ticket impresso e
            áudio. Você pode mudar qualquer item em seguida.
          </p>
          <div className="plan-picker plan-picker--five">
            {TOTEM_VERTICALS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`plan-picker__card ${vertical === item.id ? 'is-active' : ''}`}
                onClick={() => applyVertical(item.id)}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </article>
        <article className="admin-card">
          <h2>Modo do totem</h2>
          <p>
            Vale para /totem. Quiosque envia o pedido à loja; catálogo só exibe o mix. Após 2 minutos
            sem toque, o totem volta à tela inicial.
          </p>
          <div className="plan-picker">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`plan-picker__card ${mode === item.id ? 'is-active' : ''}`}
                onClick={() => {
                  setMode(item.id);
                  markDirty();
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </article>
        <article className="admin-card">
          <h2>Tipo de totem e teclado</h2>
          <p>
            A altura da tela muda a ergonomia. Totem grande (de pé) pede o teclado em cima; totem na
            cintura ou no balcão pede o teclado embaixo, pelo ângulo de visão. Escolha o desenho do
            equipamento da loja.
          </p>
          <div className="totem-rig-grid">
            {KEYBOARD_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`totem-rig-card ${keyboardPlacement === item.id ? 'is-active' : ''}`}
                onClick={() => {
                  setKeyboardPlacement(item.id);
                  markDirty();
                }}
              >
                <TotemRigPreview placement={item.id} active={keyboardPlacement === item.id} />
                <strong>{item.title}</strong>
                <span>{item.text}</span>
                <em>{item.id === 'top' ? 'Teclado no topo da tela' : 'Teclado na base da tela'}</em>
              </button>
            ))}
          </div>
        </article>
        <article className="admin-card">
          <h2>Fluxo do cliente</h2>
          <p>
            Só vale no modo quiosque. O catálogo continua só como vitrine, sem pedido, ticket ou tela
            de nome.
          </p>
          <div className="plan-picker">
            <button
              type="button"
              className={`plan-picker__card ${!askCustomerName ? 'is-active' : ''}`}
              disabled={catalogOnly}
              onClick={() => {
                setAskCustomerName(false);
                markDirty();
              }}
            >
              <strong>Não pedir o nome</strong>
              <span>O pedido segue direto depois da abertura ou dos produtos.</span>
            </button>
            <button
              type="button"
              className={`plan-picker__card ${askCustomerName ? 'is-active' : ''}`}
              disabled={catalogOnly}
              onClick={() => {
                setAskCustomerName(true);
                markDirty();
              }}
            >
              <strong>Pedir o nome antes</strong>
              <span>Tela inicial só com o nome, para chamar e imprimir o ticket.</span>
            </button>
          </div>
          <div className="plan-picker" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={`plan-picker__card ${!offerFulfillment ? 'is-active' : ''}`}
              disabled={catalogOnly}
              onClick={() => {
                setOfferFulfillment(false);
                markDirty();
              }}
            >
              <strong>Sem retirada / local</strong>
              <span>Não pergunta se leva embora ou consome no local.</span>
            </button>
            <button
              type="button"
              className={`plan-picker__card ${offerFulfillment ? 'is-active' : ''}`}
              disabled={catalogOnly}
              onClick={() => {
                setOfferFulfillment(true);
                markDirty();
              }}
            >
              <strong>Retirada ou consumir no local</strong>
              <span>O cliente escolhe no card. Serve lanchonete, cafeteria, padaria.</span>
            </button>
          </div>
          <div className="plan-picker" style={{ marginTop: 12 }}>
            <button
              type="button"
              className={`plan-picker__card ${!printTicket ? 'is-active' : ''}`}
              disabled={catalogOnly}
              onClick={() => {
                setPrintTicket(false);
                markDirty();
              }}
            >
              <strong>Sem impressão</strong>
              <span>O pedido só entra na fila do PDV, sem senha no papel.</span>
            </button>
            <button
              type="button"
              className={`plan-picker__card ${printTicket ? 'is-active' : ''}`}
              disabled={catalogOnly}
              onClick={() => {
                setPrintTicket(true);
                markDirty();
              }}
            >
              <strong>Imprimir ticket no fim</strong>
              <span>Abre a senha para a impressora térmica ou do navegador.</span>
            </button>
          </div>
        </article>
        <article className="admin-card" id="totem-finish">
          <h2>Fim do pedido</h2>
          <div className="totem-settings-options">
            <TotemSettingToggle
              label="Concluir pelo WhatsApp"
              hint="Mostra o botão para o cliente concluir pelo WhatsApp: a loja recebe o pedido e o cliente recebe a mensagem, mesmo com o vendedor ausente. Desligado, o pedido vai só para o caixa (ligue Imprimir ticket para entregar o comprovante)."
              checked={whatsAppCheckout}
              onChange={(value) => {
                setWhatsAppCheckout(value);
                markDirty();
              }}
            />
          </div>
          {!whatsAppCheckout && !printTicket ? (
            <p className="empty" style={{ marginTop: 10 }}>Dica: ligue <strong>Imprimir ticket no fim</strong> para o cliente sair com o comprovante do pedido.</p>
          ) : null}
        </article>
        <article className="admin-card" id="totem-cart">
          <h2>Carrinho</h2>
          <div className="totem-settings-options">
            <TotemSettingToggle
              label="Carrinho com vários itens"
              hint="O cliente toca em Adicionar em cada produto e finaliza tudo junto pelo rodapé. Desligado: um produto por pedido."
              checked={cartEnabled}
              onChange={(value) => {
                setCartEnabled(value);
                markDirty();
              }}
            />
          </div>
          {cartEnabled ? (
            <div className="plan-picker" style={{ marginTop: 12 }}>
              {([
                { value: 'button', title: 'Botão Finalizar', hint: 'Um toque no botão do rodapé abre a finalização.' },
                { value: 'swipe', title: 'Arrastar para finalizar', hint: 'O cliente arrasta para o lado: evita finalizar sem querer.' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`plan-picker__card ${checkoutGesture === option.value ? 'is-active' : ''}`}
                  onClick={() => {
                    setCheckoutGesture(option.value);
                    markDirty();
                  }}
                >
                  <strong>{option.title}</strong>
                  <span>{option.hint}</span>
                </button>
              ))}
            </div>
          ) : null}
        </article>
        <article className="admin-card">
          <h2>Acessibilidade</h2>
          <p>
            Voz em português nas telas do totem. O cliente ainda pode ligar ou desligar o áudio no
            canto da tela.
          </p>
          <div className="plan-picker">
            <button
              type="button"
              className={`plan-picker__card ${!audioAssist ? 'is-active' : ''}`}
              onClick={() => {
                setAudioAssist(false);
                markDirty();
              }}
            >
              <strong>Sem áudio</strong>
              <span>Totem silencioso. Padrão do varejo geral.</span>
            </button>
            <button
              type="button"
              className={`plan-picker__card ${audioAssist ? 'is-active' : ''}`}
              onClick={() => {
                setAudioAssist(true);
                markDirty();
              }}
            >
              <strong>Áudio de acessibilidade</strong>
              <span>Lê nome, pedido e senha. Ajuda quem tem baixa visão.</span>
            </button>
          </div>
        </article>
      </TotemSettingsGroup>
      <TotemSettingsGroup id="totem-group-images" icon="🖼️" title="Imagens de exibição" hint="Tela de abertura (logo, imagem, cor e saudação) e propagandas no topo da vitrine." open={openGroups.includes('totem-group-images')} onToggle={() => toggleGroup('totem-group-images')}>
        <article className="admin-card" id="totem-opening">
          <h2>Tela de boas-vindas · logo e propaganda</h2>
          <AdminPicker label="Conteúdo sobre o fundo" value={attractContent} options={[{value:'full',label:'Logo no centro + mensagem'},{value:'text',label:'Só a mensagem (sem logo no centro)'},{value:'background',label:'Só a imagem de fundo'}]} onChange={value=>setAttractContent(value as typeof attractContent)}/>
          <p>
            Tela cheia esperando o cliente. Ideal enquanto o mix de produtos ainda é pequeno: destaque
            a logo da loja e uma propaganda de fundo. Depois de 2 minutos sem toque, o totem volta para
            cá.
          </p>
          <div className="plan-picker">
            <button
              type="button"
              className={`plan-picker__card ${showAttractScreen ? 'is-active' : ''}`}
              onClick={() => {
                setShowAttractScreen(true);
                markDirty();
              }}
            >
              <strong>Com tela de abertura</strong>
              <span>Logo da loja e botões grandes. Recomendado para qualquer ramo.</span>
            </button>
            <button
              type="button"
              className={`plan-picker__card ${!showAttractScreen ? 'is-active' : ''}`}
              onClick={() => {
                setShowAttractScreen(false);
                markDirty();
              }}
            >
              <strong>Sem tela de abertura</strong>
              <span>O totem já abre nos produtos, como um catálogo direto.</span>
            </button>
          </div>
          {showAttractScreen ? (
            <div className="plan-picker" style={{ marginTop: 12 }}>
              <button
                type="button"
                className={`plan-picker__card plan-picker__card--with-thumb ${attractLayout === 'logoPromo' ? 'is-active' : ''}`}
                onClick={() => {
                  setAttractLayout('logoPromo');
                  markDirty();
                }}
              >
                <div className="totem-attract-thumb" aria-hidden>
                  <TotemAttractScene
                    preview
                    storeName={storeName}
                    storeLogo={storeLogo}
                    greeting={storeGreeting()}
                    gradientColor={attractGradientColor}
                    backgroundImage={attractBackground}
                    layout="logoPromo"
                    showActionButtons={showActionButtons}
                    customGreetingText={customGreetingText}
                    customSubtitleText={customSubtitleText}
                  />
                </div>
                <strong>Logo + propaganda</strong>
                <span>
                  Logo grande da loja e a arte de fundo bem visível. Bom quando ainda há poucos itens no
                  catálogo.
                </span>
              </button>
              <button
                type="button"
                className={`plan-picker__card plan-picker__card--with-thumb ${attractLayout === 'standard' ? 'is-active' : ''}`}
                onClick={() => {
                  setAttractLayout('standard');
                  markDirty();
                }}
              >
                <div className="totem-attract-thumb" aria-hidden>
                  <TotemAttractScene
                    preview
                    storeName={storeName}
                    storeLogo={storeLogo}
                    greeting={storeGreeting()}
                    gradientColor={attractGradientColor}
                    backgroundImage={attractBackground}
                    layout="standard"
                    showActionButtons={showActionButtons}
                    customGreetingText={customGreetingText}
                    customSubtitleText={customSubtitleText}
                  />
                </div>
                <strong>Abertura padrão</strong>
                <span>Nome da loja, saudação e lavagem colorida por cima do fundo.</span>
              </button>
              <button
                type="button"
                className={`plan-picker__card plan-picker__card--with-thumb ${attractLayout === 'greeting' ? 'is-active' : ''}`}
                onClick={() => {
                  setAttractLayout('greeting');
                  markDirty();
                }}
              >
                <div className="totem-attract-thumb" aria-hidden>
                  <TotemAttractScene
                    preview
                    storeName={storeName}
                    storeLogo={storeLogo}
                    greeting={storeGreeting()}
                    gradientColor={attractGradientColor}
                    backgroundImage={attractBackground}
                    layout="greeting"
                    showActionButtons={showActionButtons}
                    customGreetingText={customGreetingText}
                    customSubtitleText={customSubtitleText}
                  />
                </div>
                <strong>Só saudação</strong>
                <span>Sem logo e sem nome da loja: só a saudação por cima da arte de fundo.</span>
              </button>
            </div>
          ) : null}

          {showAttractScreen ? (
            <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line, #e2e8f0)' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px' }}>Botões e Textos da Tela Inicial</h3>
              <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--mute, #64748b)' }}>
                Defina se a tela terá botões interativos ou se funcionará como uma vitrine limpa (apenas fotos e textos), além de personalizar as mensagens de boas-vindas.
              </p>
              <div className="plan-picker">
                <button
                  type="button"
                  className={`plan-picker__card ${showActionButtons ? 'is-active' : ''}`}
                  onClick={() => {
                    setShowActionButtons(true);
                    markDirty();
                  }}
                >
                  <strong>Com botões de ação (Padrão)</strong>
                  <span>Exibe os botões "Iniciar um novo pedido" e "Ver catálogo de produtos".</span>
                </button>
                <button
                  type="button"
                  className={`plan-picker__card ${!showActionButtons ? 'is-active' : ''}`}
                  onClick={() => {
                    setShowActionButtons(false);
                    markDirty();
                  }}
                >
                  <strong>Modo Vitrine Limpa (Sem botões)</strong>
                  <span>Não exibe botões: mostra apenas as imagens e o texto que você definir.</span>
                </button>
              </div>

              <div className="admin-form" style={{ marginTop: 16 }}>
                <label>
                  Mensagem de saudação personalizada
                  <input
                    type="text"
                    value={customGreetingText}
                    maxLength={100}
                    placeholder={`Padrão automático: ${storeGreeting()} (alterna conforme horário)`}
                    onChange={(event) => {
                      setCustomGreetingText(event.target.value);
                      markDirty();
                    }}
                  />
                  <span style={{ fontSize: '0.82rem', color: 'var(--mute, #64748b)', marginTop: 4 }}>
                    Deixe em branco para usar o padrão automático: Bom dia / Boa tarde / Boa noite.
                  </span>
                </label>

                <label className="span-2">
                  Texto ou comunicado para exibir na tela (opcional)
                  <textarea
                    rows={2}
                    value={customSubtitleText}
                    maxLength={250}
                    placeholder="Ex.: Sejam bem-vindos! Confira novidades da semana e condições especiais."
                    onChange={(event) => {
                      setCustomSubtitleText(event.target.value);
                      markDirty();
                    }}
                  />
                  <span style={{ fontSize: '0.82rem', color: 'var(--mute, #64748b)', marginTop: 4 }}>
                    Texto adicional em destaque que será escrito e exibido na tela de abertura do totem.
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          <div className="admin-form" style={{ marginTop: 16 }}>
            <label>
              Nome da loja na tela
              <input
                value={storeName}
                onChange={(event) => {
                  setStoreName(event.target.value);
                  markDirty();
                }}
                placeholder="Sua Loja"
              />
            </label>
            <label>
              Descrição no cabeçalho
              <input value={headerSubtitle} maxLength={140} placeholder="Ex.: Quiosque de venda — Shopping" onChange={event => { setHeaderSubtitle(event.target.value); markDirty(); }} />
              <small>Texto exibido abaixo do nome da loja. Deixe vazio para usar a descrição padrão.</small>
            </label>
          </div>
          <div className="totem-settings-brand-media">
            <TotemSettingsImage label="Logo da loja" hint="Prefira uma imagem quadrada com fundo transparente." value={storeLogo} convert={fileToStoreLogo} onChange={value=>{setStoreLogo(value);markDirty();}}/>
            <TotemSettingsImage label="Imagem de abertura" hint="Uma foto ou arte vertical funciona melhor no totem. Confira o resultado na prévia abaixo." value={attractBackground} convert={fileToAttractBackground} onChange={value=>{setAttractBackground(value);if(value&&attractLayout==='standard')setAttractLayout('logoPromo');markDirty();}}/>
          </div>
          <div className="totem-color-field">
            <p>Cor do gradiente</p>
            <span>
              Sem propaganda, a tela inteira usa essa cor. Com propaganda, ela vira a lavagem suave por
              cima da imagem.
            </span>
            <div className="totem-color-swatches">
              {ATTRACT_COLOR_PRESETS.map((item) => (
                <button
                  key={item.hex}
                  type="button"
                  className={`totem-color-swatch ${attractGradientColor === item.hex ? 'is-active' : ''}`}
                  style={{ background: item.hex }}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => {
                    setAttractGradientColor(item.hex);
                    markDirty();
                  }}
                />
              ))}
              <label className="totem-color-custom">
                <input
                  type="color"
                  value={attractGradientColor}
                  onChange={(event) => {
                    setAttractGradientColor(event.target.value);
                    markDirty();
                  }}
                />
                Outra cor
              </label>
            </div>
          </div>

          <div className="totem-screen-preview" aria-label="Pré-visualização da tela de abertura do totem">
            <div className="totem-screen-preview__bar">
              <div>
                <span>Pré-visualização ao vivo</span>
                <strong>
                  {showAttractScreen
                    ? attractLayout === 'logoPromo'
                      ? 'Tela de abertura · Logo + propaganda'
                      : attractLayout === 'greeting'
                        ? 'Tela de abertura · Só saudação'
                        : 'Tela de abertura · Padrão'
                    : 'Sem abertura · vai direto ao catálogo'}
                </strong>
              </div>
              <em>Como o cliente vê no totem</em>
            </div>
            <div className="totem-screen-preview__stage">
              <div className="totem-screen-preview__bezel">
                <div className="totem-screen-preview__glass">
                  {showAttractScreen ? (
                    <TotemAttractScene
                      preview
                      storeName={storeName}
                      storeLogo={storeLogo}
                      greeting={storeGreeting()}
                      gradientColor={attractGradientColor}
                      backgroundImage={attractBackground}
                      layout={attractLayout}
                      content={attractContent}
                      showActionButtons={showActionButtons}
                      customGreetingText={customGreetingText}
                      customSubtitleText={customSubtitleText}
                    />
                  ) : (
                    <div className="totem-screen-preview__catalog">
                      <header>
                        <strong>{storeName.trim() || 'Sua Loja'}</strong>
                        <span>{headerSubtitle.trim() || 'Catálogo'}</span>
                      </header>
                      <div
                        className="totem-preview__grid"
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                      >
                        {copy.previewItems.map((item) => (
                          <article key={item.name} className="totem-preview__card">
                            <div className="totem-preview__media" />
                            <strong>{item.name}</strong>
                            <span>{item.price}</span>
                          </article>
                        ))}
                      </div>
                      <p className="totem-preview__note" style={{ margin: '10px 0 0' }}>
                        Sem tela de abertura o totem já mostra os produtos.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="totem-screen-preview__hint">
              {showAttractScreen
                ? 'Altere logo, propaganda, layout ou cor — o preview atualiza na hora. Depois salve as configurações.'
                : 'Se quiser a logo e a propaganda em tela cheia, ative “Com tela de abertura” acima.'}
            </p>
          </div>
        </article>
        <article className="admin-card" id="totem-banners">
          <h2>Propaganda / imagem em destaque no topo</h2>
          <p className="totem-settings-note">
            Até {TOTEM_MAX_TOP_BANNERS} imagens no topo da vitrine. Com mais de uma, elas giram sozinhas e o
            cliente pode arrastar para o lado. Use imagens largas (formato faixa, ex.: 1600 × 600).
          </p>
          <TotemSettingsBanners
            value={topBanners}
            max={TOTEM_MAX_TOP_BANNERS}
            convert={fileToAttractBackground}
            onChange={(next) => {
              setTopBanners(next);
              markDirty();
            }}
          />

        </article>
      </TotemSettingsGroup>
      <TotemSettingsGroup id="totem-group-messages" icon="💬" title="Configurações de mensagem" hint="Atendimento guiado e a mensagem automática que o cliente recebe no WhatsApp." open={openGroups.includes('totem-group-messages')} onToggle={() => toggleGroup('totem-group-messages')}>
        <article className="admin-card" id="totem-assistant">
          <h2>Atendimento guiado</h2>
          <p>Uma conversa simples para ajudar o cliente a escolher e encaminhar o pedido ao vendedor.</p>
          <TotemSettingToggle label="Conversa passo a passo" hint="O assistente recebe o cliente e ajuda na escolha." checked={assistant.enabled} onChange={enabled=>setAssistant(current=>({...current,enabled}))}/>
          <div className="totem-settings-identity">
            <TotemSettingsImage label="Foto do assistente" hint="Use uma foto ou avatar. Sem imagem, mostramos a inicial do nome." portrait value={assistant.avatar} convert={fileToStoreLogo} onChange={avatar=>setAssistant(current=>({...current,avatar}))}/>
          <div className="admin-form">
            <label>Nome do assistente<input value={assistant.name} maxLength={80} onChange={e=>setAssistant(current=>({...current,name:e.target.value}))}/></label>
            <AdminPicker label="Vendedor que receberá o atendimento" value={assistant.sellerId} options={[{value:'',label:'Atendimento da loja'},...assistantSellers.map(seller=>({value:seller.id,label:seller.name}))]} onChange={id=>{const seller=assistantSellers.find(item=>item.id===id);setAssistant(current=>({...current,sellerId:id,name:seller?.name||current.name,whatsapp:seller?.phone||current.whatsapp}));}}/>
            <label>WhatsApp do vendedor (DDI e DDD)<input value={assistant.whatsapp} onChange={e=>setAssistant(current=>({...current,whatsapp:e.target.value.replace(/\D/g,'')}))} placeholder="5524…"/></label>
          </div></div>
          <div className="totem-settings-options">
            <TotemSettingToggle label="Preferência de compra" hint="Perguntar sobre preço baixo, ofertas ou novidades." checked={assistant.askIntent} onChange={askIntent=>setAssistant(current=>({...current,askIntent}))}/>
            <TotemSettingToggle label="Marca preferida" hint="Mostrar apenas marcas com produtos disponíveis." checked={assistant.askBrand} onChange={askBrand=>setAssistant(current=>({...current,askBrand}))}/>
          </div>
          <div className="totem-settings-conversation">
            <div className="totem-settings-messages">
              <h3>Personalize as mensagens</h3>
              <p>O marcador <code>{'{nome}'}</code> usa o nome que o cliente informar, inclusive nomes como Ana Paula. <code>{'{vendedor}'}</code> usa o nome do assistente.</p>
              {(['namePrompt','intentPrompt','brandPrompt','productsPrompt','closingPrompt'] as const).map((key,index)=><details key={key} className="totem-settings-step" open={key==='namePrompt'?true:undefined}><summary><span>{index+1}</span><strong>{['Boas-vindas','Preferência de compra','Marca','Produtos sugeridos','Finalizar com vendedor'][index]}</strong></summary><label>Mensagem do assistente<textarea rows={3} value={assistant[key]} maxLength={300} onChange={e=>setAssistant(current=>({...current,[key]:e.target.value}))}/></label></details>)}
            </div>
            <aside className="totem-settings-chat" aria-label="Exemplo da conversa">
              <div className="totem-settings-chat__heading">{assistant.avatar?<img src={assistant.avatar} alt=""/>:<span aria-hidden="true">{assistant.name.slice(0,1)||'M'}</span>}<div><strong>{assistant.name||'Assistente'}</strong><small>Prévia da conversa</small></div></div>
              <label>Nome de exemplo<input value={exampleName} maxLength={100} onChange={e=>setExampleName(e.target.value)} placeholder="Ana Paula"/></label>
              <p className="totem-settings-chat__bubble">{assistantText(assistant.namePrompt,exampleName,assistant.name)}</p>
              <p className="totem-settings-chat__reply">{exampleName||'Seu cliente'}</p>
              {(assistant.askIntent?[assistant.intentPrompt]:[]).concat(assistant.askBrand?[assistant.brandPrompt]:[],[assistant.productsPrompt,assistant.closingPrompt]).map((text,index)=><p key={index} className="totem-settings-chat__bubble">{assistantText(text,exampleName,assistant.name)}</p>)}
              <small>Exemplo de como o cliente verá as mensagens. O nome real será informado no totem.</small>
            </aside>
          </div>
          <p className="totem-settings-note">Configure o WhatsApp de quem recebe a venda para gerar o QR Code. O vendedor conclui o pagamento.</p>
        </article>
        <article className="admin-card" id="totem-whatsapp-message">
          <h2>Mensagem automática no WhatsApp do cliente</h2>
          <p>
            Quando o cliente toca em <strong>Concluir pelo WhatsApp</strong>, a loja envia esta mensagem
            sozinha, pelo WhatsApp conectado em Configurações › Comunicação, para o telefone que ele
            digitou no totem. O cliente não precisa ler QR Code nem abrir o WhatsApp.
          </p>
          <label className="totem-settings-whatsapp-message">
            Mensagem
            <textarea
              rows={12}
              maxLength={1500}
              value={customerWhatsAppMessage}
              onChange={(event) => {
                setCustomerWhatsAppMessage(event.target.value);
                markDirty();
              }}
            />
          </label>
          <p className="totem-settings-note">
            Marcadores: <code>{'{nome}'}</code> primeiro nome do cliente · <code>{'{vendedor}'}</code> ·{' '}
            <code>{'{loja}'}</code> · <code>{'{produto}'}</code> · <code>{'{atributos}'}</code> (ex.: Cor: preto ·
            Capacidade: 128GB) · <code>{'{pagamento}'}</code> · <code>{'{valor}'}</code> ·{' '}
            <code>{'{retirada}'}</code> · <code>{'{pedido}'}</code> · <code>{'{itens}'}</code> (lista do
            carrinho, um item por linha) · <code>{'{total}'}</code>. Cada atributo também vira marcador com o
            próprio nome, como <code>{'{Cor}'}</code> e <code>{'{Capacidade}'}</code>. No WhatsApp,{' '}
            <code>*texto*</code> fica em negrito. Linhas com marcador sem informação somem da mensagem.
          </p>
        </article>
        <article className="admin-card">
          <h2>WhatsApp e Notificações</h2>
          <p>
            As configurações da Evolution API e envio de WhatsApp agora são gerenciadas centralmente em{' '}
            <Link to="/painel/operacoes?tab=comunicacao" style={{ fontWeight: 650, color: 'var(--accent, #0f766e)' }}>
              Operações → Comunicação &amp; Mensagens
            </Link>
            , servindo tanto para os pedidos do Totem quanto para Ordens de Serviço, PDV e comunicados da loja.
          </p>
        </article>
      </TotemSettingsGroup>
      <TotemSettingsGroup id="totem-group-sales" icon="🔒" title="Vendas e segurança" hint="Taxa de cartão, senha de saída do totem e onde cadastrar produtos." open={openGroups.includes('totem-group-sales')} onToggle={() => toggleGroup('totem-group-sales')}>
        <article className="admin-card admin-card--form">
          <h2>Taxa de Cartão / Parcelamento</h2>
          <p>
            Percentual padrão de taxa de cartão (%) embutido no cálculo de parcelas (ex.: 12x) exibido na
            vitrine e no checkout do totem. Você também pode definir uma taxa específica por produto no
            cadastro do catálogo.
          </p>
          <div className="admin-form">
            <label>
              Taxa de cartão padrão do Totem (%)
              <CurrencyInput
                value={cardFeePercent}
                onChange={(value) => {
                  setCardFeePercent(Math.min(100, value));
                  markDirty();
                }}
              />
            </label>
          </div>
        </article>
        <article className="admin-card admin-card--form">
          <h2>Senha para sair do totem e do PDV</h2>
          <p>
            Protege a saída das telas /totem e /caixa. Esta senha pertence à empresa contratante e fica salva no
            banco de dados para liberar a saída em qualquer totem ou terminal da loja.
          </p>
          <div className="admin-form">
            <label>
              Nova senha
              <input
                type="password"
                value={exitPassword}
                autoComplete="new-password"
                minLength={4}
                onChange={(event) => {
                  setExitPassword(event.target.value);
                  markDirty();
                }}
                placeholder="Mínimo 4 caracteres"
              />
            </label>
            <label>
              Confirmar senha
              <input
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                minLength={4}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  markDirty();
                }}
                placeholder="Repita a senha"
              />
            </label>
          </div>
        </article>
        <article className="admin-card">
          <h2>Estoque do totem</h2>
          <p>
            O totem lista <strong>somente</strong> produtos do estoque no banco com “Exibir no totem”
            marcado. O catálogo demo (iPhones hardcoded / seed de vitrine) foi removido.
          </p>
        </article>
        <article className="admin-card">
          <h2>Catálogo e atributos</h2>
          <p>
            Cadastre produtos, preços e atributos aqui na aba Totem — o mesmo estoque que a Retaguarda usa
            quando o módulo estiver contratado. Marque “Exibir no totem” e use atributos com filtro
            ativo para a vitrine.
          </p>
          <div className="admin-toolbar admin-toolbar--stack">
            <Link to="/painel/totem" className="btn btn--ghost">
              Dados do totem
            </Link>
            <Link to="/painel/totem/produtos" className="btn btn--ghost">
              Catálogo do totem
            </Link>
            <Link to="/painel/totem/especificacoes?aba=atributos" className="btn btn--ghost">
              Atributos
            </Link>
          </div>
        </article>
      </TotemSettingsGroup>
    </section>
  );
}
