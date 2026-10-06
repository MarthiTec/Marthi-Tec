import {TotemSettingToggle,TotemSettingsImage} from './TotemSettingsControls';
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
  const [loadingSettings,setLoadingSettings]=useState(true);
  const [settingsLoadError,setSettingsLoadError]=useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(()=>setSaved(false),[assistant,attractContent]);

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

  async function save() {
    const next = exitPassword.trim();
    if (next.length < 4) {
      setError('A senha precisa ter pelo menos 4 caracteres.');
      setSaved(false);
      return;
    }
    if (next !== confirmPassword.trim()) {
      setError('A confirmação não confere com a senha.');
      setSaved(false);
      return;
    }
    try {
      await saveTotemSettings({
        vertical,
        mode,
        exitPassword: next,
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
      });
      setError(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
      setSaved(false);
    }
  }

  if(loadingSettings||settingsLoadError)return <section className="admin-page totem-settings-page"><article className="admin-card"><h1>Configurações do totem</h1><p role="status">{loadingSettings?'Carregando suas configurações salvas…':error}</p>{settingsLoadError?<button className="btn btn--primary" onClick={()=>window.location.reload()}>Tentar novamente</button>:null}</article></section>;

  return (
    <section className="admin-page totem-settings-page">
      <h1>Configure a experiência do seu Totem</h1>
      <p>Escolha a aparência, personalize a conversa e indique quem receberá os pedidos. Preços, ofertas e dados fiscais ficam no cadastro de produtos.</p>
      <nav className="admin-toolbar" aria-label="Seções das configurações">
        <a className="btn btn--ghost" href="#totem-assistant">Atendimento guiado</a>
        <a className="btn btn--ghost" href="#totem-opening">Tela de abertura</a>
        <Link className="btn btn--ghost" to="/painel/totem/produtos">Produtos e ofertas</Link>
      </nav>
      <Link to="/painel/totem/previa" className="btn btn--primary">Visualizar Totem em escala real</Link>
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

      <article className="admin-card" id="totem-opening">
        <h2>Tela de boas-vindas · logo e propaganda</h2>
        <AdminPicker label="Conteúdo sobre o fundo" value={attractContent} options={[{value:'full',label:'Logo e textos'},{value:'text',label:'Somente textos'},{value:'background',label:'Somente fundo'}]} onChange={value=>setAttractContent(value as typeof attractContent)}/>
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
          <TotemSettingsImage label="Imagem de abertura" hint="Uma foto ou arte vertical funciona melhor no totem. Confira o resultado na prévia abaixo." value={attractBackground} convert={fileToAttractBackground} onChange={value=>{setAttractBackground(value);if(value)setAttractLayout('logoPromo');markDirty();}}/>
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

      <article className="admin-card">
        <h2>Estoque do totem</h2>
        <p>
          O totem lista <strong>somente</strong> produtos do estoque no banco com “Exibir no totem”
          marcado. O catálogo demo (iPhones hardcoded / seed de vitrine) foi removido.
        </p>
      </article>

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
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={cardFeePercent}
              placeholder="0"
              onChange={(event) => {
                setCardFeePercent(Math.max(0, Math.min(100, Number(event.target.value) || 0)));
                markDirty();
              }}
            />
          </label>
        </div>
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
        {error ? <p className="qty-low">{error}</p> : null}
        <div className="admin-toolbar admin-toolbar--stack" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={() => void save()}>
            Salvar configurações do totem
          </button>
          {saved ? (
            <span className="empty" style={{ color: 'var(--accent, #0f766e)', fontWeight: 600 }}>
              ✓ Configurações salvas no banco de dados da empresa! Abra /totem para conferir.
            </span>
          ) : null}
        </div>
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
          <Link to="/painel/totem/atributos" className="btn btn--ghost">
            Atributos
          </Link>
        </div>
      </article>
    </section>
  );
}
