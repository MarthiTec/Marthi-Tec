import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TotemAttractScene } from '../totem/TotemAttractScene';
import { TotemRigPreview } from './TotemRigPreview';
import {
  ATTRACT_COLOR_PRESETS,
  fileToAttractBackground,
  fileToStoreLogo,
  getTotemSettings,
  saveTotemSettings,
  storeGreeting,
  totemCopy,
  verticalPreset,
  TOTEM_VERTICALS,
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
  const [shareStockWithErp, setShareStockWithErp] = useState(() => initial.shareStockWithErp);
  const [columns, setColumns] = useState<TotemColumns>(() => initial.columns);
  const [askCustomerName, setAskCustomerName] = useState(() => initial.askCustomerName);
  const [showAttractScreen, setShowAttractScreen] = useState(() => initial.showAttractScreen);
  const [storeName, setStoreName] = useState(() => initial.storeName);
  const [storeLogo, setStoreLogo] = useState(() => initial.storeLogo);
  const [attractBackground, setAttractBackground] = useState(() => initial.attractBackground);
  const [attractGradientColor, setAttractGradientColor] = useState(() => initial.attractGradientColor);
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setShareStockWithErp(preset.shareStockWithErp);
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
        shareStockWithErp,
        columns,
        showAttractScreen,
        storeName,
        storeLogo,
        attractBackground,
        attractGradientColor,
        keyboardPlacement,
        askCustomerName,
        offerFulfillment,
        printTicket,
        audioAssist,
        storeWhatsApp,
        notifyCustomerOnLead,
        locationLabel,
      });
      setError(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.');
      setSaved(false);
    }
  }

  return (
    <section className="admin-page">
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
        <h2>Tela de boas-vindas</h2>
        <p>
          Tela cheia com a logo da loja, esperando o cliente. Dá para usar uma foto de fundo ou só um
          gradiente na cor da loja. Depois de 2 minutos sem toque, o totem volta para cá.
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
            Logo da loja
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void fileToStoreLogo(file)
                  .then((dataUrl) => {
                    setStoreLogo(dataUrl);
                    markDirty();
                  })
                  .catch(() => setError('Não foi possível ler a logo.'));
              }}
            />
          </label>
          <label className="span-2">
            Foto de fundo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void fileToAttractBackground(file)
                  .then((dataUrl) => {
                    setAttractBackground(dataUrl);
                    markDirty();
                  })
                  .catch(() => setError('Não foi possível ler a imagem de fundo.'));
              }}
            />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
          {storeLogo ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setStoreLogo(null);
                markDirty();
              }}
            >
              Remover logo
            </button>
          ) : null}
          {attractBackground ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setAttractBackground(null);
                markDirty();
              }}
            >
              Remover foto de fundo
            </button>
          ) : null}
        </div>
        <div className="totem-color-field">
          <p>Cor do gradiente</p>
          <span>
            Sem foto, a tela inteira usa essa cor. Com foto, ela vira a lavagem por cima da imagem.
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
        {showAttractScreen ? (
          <TotemAttractScene
            preview
            storeName={storeName}
            storeLogo={storeLogo}
            greeting={storeGreeting()}
            gradientColor={attractGradientColor}
            backgroundImage={attractBackground}
          />
        ) : null}
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
          Escolha se a tela pública usa o estoque cadastrado (itens com “Exibir no totem”) ou um
          catálogo demo. Com ERP contratado, é o mesmo cadastro do app ERP.
        </p>
        {vertical !== 'phones' && !shareStockWithErp ? (
          <p className="totem-preview__note">
            O catálogo demo ainda é de celular. Para lanchonete, livraria ou ótica, use o estoque
            cadastrado com os produtos do ramo.
          </p>
        ) : null}
        <div className="plan-picker">
          <button
            type="button"
            className={`plan-picker__card ${!shareStockWithErp ? 'is-active' : ''}`}
            onClick={() => {
              setShareStockWithErp(false);
              markDirty();
            }}
          >
            <strong>Catálogo demo</strong>
            <span>Vitrine de demonstração, sem puxar o estoque cadastrado.</span>
          </button>
          <button
            type="button"
            className={`plan-picker__card ${shareStockWithErp ? 'is-active' : ''}`}
            onClick={() => {
              setShareStockWithErp(true);
              markDirty();
            }}
          >
            <strong>Usar estoque cadastrado</strong>
            <span>Só itens com “Exibir no totem” e quantidade &gt; 0.</span>
          </button>
        </div>
      </article>

      <article className="admin-card admin-card--form">
        <h2>WhatsApp do Totem (Evolution)</h2>
        <p>
          O QR Code é lido <strong>uma vez</strong> no Evolution Manager (
          <a href="https://marthi-tec.discloud.app" target="_blank" rel="noreferrer">
            marthi-tec.discloud.app
          </a>
          ): pareia o chip/WhatsApp da instância Marthi. Depois disso, o sistema só usa a API
          (URL + instância + API key no servidor) para <strong>enviar</strong> mensagens.
        </p>
        <p>
          Aqui no painel a loja informa o número que vai <strong>receber</strong> o lead do totem —
          não é preciso escanear QR de novo por loja. Trabalhe conosco / suporte usam o número
          comercial Marthi (mesmo Evolution, outro destino).
        </p>
        <div className="admin-form">
          <label>
            WhatsApp da loja (com DDI)
            <input
              type="tel"
              inputMode="tel"
              value={storeWhatsApp}
              placeholder="5524999999999"
              onChange={(event) => {
                setStoreWhatsApp(event.target.value.replace(/\D/g, '').slice(0, 15));
                markDirty();
              }}
            />
          </label>
          <label>
            Local / shopping (opcional na mensagem)
            <input
              type="text"
              value={locationLabel}
              maxLength={80}
              placeholder="Ex.: Shopping Olga Sola, Três Rios"
              onChange={(event) => {
                setLocationLabel(event.target.value);
                markDirty();
              }}
            />
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={notifyCustomerOnLead}
              onChange={(event) => {
                setNotifyCustomerOnLead(event.target.checked);
                markDirty();
              }}
            />
            <span>Também avisar o cliente no WhatsApp após o pedido</span>
          </label>
        </div>
        <p className="empty" style={{ marginTop: 8 }}>
          Sem número salvo, o pedido ainda abre no PDV, mas o WhatsApp não dispara. Se a Evolution
          estiver desconectada, reconecte pelo QR no Manager.
        </p>
      </article>

      <article className="admin-card admin-card--form">
        <h2>Senha para sair do totem e do PDV</h2>
        <p>
          Protege a saída das telas /totem e /caixa. Só quem souber a senha consegue fechar o
          quiosque ou o caixa e voltar para a home.
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
          {saved ? <span className="empty">Configurações do totem salvas. Abra /totem para ver.</span> : null}
        </div>
      </article>

      <article className="admin-card">
        <h2>Catálogo e atributos</h2>
        <p>
          Cadastre produtos, preços e atributos aqui na aba Totem — o mesmo estoque que o ERP usa
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
