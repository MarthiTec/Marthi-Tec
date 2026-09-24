export type TotemMode = 'kiosk' | 'catalog';
export type TotemColumns = 1 | 2 | 3 | 4;
export type TotemVertical = 'general' | 'food' | 'retail' | 'phones' | 'optics';
/** De pé / tela alta → teclado no topo. Cintura / balcão → teclado embaixo. */
export type TotemKeyboardPlacement = 'top' | 'bottom';
/**
 * standard = abertura completa com lavagens coloridas.
 * logoPromo = destaque na logo da loja + propaganda de fundo (ideal sem mix grande).
 */
export type TotemAttractLayout = 'standard' | 'logoPromo';

export const TOTEM_DINE_ID = 'TOTEM-DINE';
export const TOTEM_DINE_OPTIONS = ['Consumir no local', 'Retirada'] as const;

export type TotemSettings = {
  mode: TotemMode;
  /** Senha para sair da tela /totem (operador da loja). */
  exitPassword: string;
  /**
   * true = totem usa o estoque do ERP (itens com “exibir no totem”).
   * false = catálogo demo isolado do ERP.
   */
  shareStockWithErp: boolean;
  /** Ramo da loja: define o preset recomendado do totem. */
  vertical: TotemVertical;
  /** Quantos cards por linha na vitrine. */
  columns: TotemColumns;
  /** Tela de boas-vindas com logo e botões grandes. */
  showAttractScreen: boolean;
  /** Nome da loja na tela de abertura e no ticket. */
  storeName: string;
  /** Logo da loja (data URL). Sem arquivo, usa a marca Marthi. */
  storeLogo: string | null;
  /** Foto / propaganda de fundo da tela de abertura (data URL). */
  attractBackground: string | null;
  /** Cor base do gradiente quando não há foto, e da lavagem sobre a foto. */
  attractGradientColor: string;
  /**
   * Como montar a tela de abertura.
   * logoPromo = logo grande da loja + propaganda bem visível ao fundo.
   */
  attractLayout: TotemAttractLayout;
  /**
   * Onde o teclado virtual aparece.
   * top = totem grande / de pé (alcance na altura do peito).
   * bottom = totem de cintura / balcão (ângulo de visão de cima).
   */
  keyboardPlacement: TotemKeyboardPlacement;
  /** Tela só com o nome, antes do catálogo, para o ticket de aguarde. */
  askCustomerName: boolean;
  /** Opção Retirada vs Consumir no local no card e no pedido. */
  offerFulfillment: boolean;
  /** Imprime o ticket/senha no fim do pedido. */
  printTicket: boolean;
  /** Áudio de acessibilidade (voz em português). */
  audioAssist: boolean;
  /**
   * WhatsApp da loja que recebe o lead do totem (DDI+DDD+número, ex.: 5524999999999).
   * O Evolution envia a mensagem PARA este número a partir da instância Marthi.
   */
  storeWhatsApp: string;
  /** Se true, o cliente também recebe um aviso no WhatsApp após o pedido no totem. */
  notifyCustomerOnLead: boolean;
  /** Texto opcional na mensagem (ex.: Shopping Olga Sola, Três Rios). */
  locationLabel: string;
};

export type TotemCopy = {
  kioskSubtitle: string;
  catalogSubtitle: string;
  searchPlaceholder: string;
  nextButton: string;
  confirmButton: string;
  sendingButton: string;
  welcomeTitle: string;
  welcomeText: string;
  doneTitle: string;
  doneHint: string;
  footerKiosk: string;
  footerCatalog: string;
  footerNamed: string;
  showInstallments: boolean;
  showBrandFilters: boolean;
  previewItems: { name: string; price: string }[];
};

type VerticalPreset = Pick<
  TotemSettings,
  | 'mode'
  | 'columns'
  | 'showAttractScreen'
  | 'askCustomerName'
  | 'offerFulfillment'
  | 'printTicket'
  | 'audioAssist'
  | 'keyboardPlacement'
  | 'attractGradientColor'
  | 'shareStockWithErp'
>;

export const TOTEM_VERTICALS: {
  id: TotemVertical;
  title: string;
  text: string;
  preset: VerticalPreset;
  copy: TotemCopy;
}[] = [
  {
    id: 'general',
    title: 'Varejo geral',
    text: 'Padrão. Tela de boas-vindas com logo, 2 cards por linha. Dá para desligar a abertura.',
    preset: {
      mode: 'kiosk',
      columns: 2,
      showAttractScreen: true,
      askCustomerName: false,
      offerFulfillment: false,
      printTicket: false,
      audioAssist: false,
      keyboardPlacement: 'bottom',
      attractGradientColor: '#0f766e',
      shareStockWithErp: false,
    },
    copy: {
      kioskSubtitle: 'Quiosque de venda',
      catalogSubtitle: 'Catálogo da loja',
      searchPlaceholder: 'Buscar produto',
      nextButton: 'Próximo',
      confirmButton: 'Confirmar pedido',
      sendingButton: 'Enviando…',
      welcomeTitle: 'Qual é o seu nome?',
      welcomeText: 'Usamos só para chamar você no ticket de aguarde.',
      doneTitle: 'Pedido enviado',
      doneHint: 'A loja já recebeu. Aguarde no balcão se precisar.',
      footerKiosk: 'Escolha o item, toque em Próximo e confirme. O pedido cai na fila da loja.',
      footerCatalog: 'Toque nas fotos para passar o carrossel. Este totem é um catálogo da loja.',
      footerNamed: 'Informe o nome, escolha o item e confirme. Seu ticket entra na fila da loja.',
      showInstallments: true,
      showBrandFilters: false,
      previewItems: [
        { name: 'Produto A', price: 'R$ 18,90' },
        { name: 'Produto B', price: 'R$ 24,00' },
        { name: 'Produto C', price: 'R$ 12,50' },
        { name: 'Produto D', price: 'R$ 39,90' },
      ],
    },
  },
  {
    id: 'food',
    title: 'Lanchonete e cafeteria',
    text: 'Pedido com senha, nome para chamar, retirada ou consumir no local, ticket impresso.',
    preset: {
      mode: 'kiosk',
      columns: 3,
      showAttractScreen: true,
      askCustomerName: true,
      offerFulfillment: true,
      printTicket: true,
      audioAssist: true,
      keyboardPlacement: 'bottom',
      attractGradientColor: '#b45309',
      shareStockWithErp: true,
    },
    copy: {
      kioskSubtitle: 'Faça seu pedido',
      catalogSubtitle: 'Cardápio da loja',
      searchPlaceholder: 'Buscar lanche ou bebida',
      nextButton: 'Pedir',
      confirmButton: 'Confirmar pedido',
      sendingButton: 'Enviando…',
      welcomeTitle: 'Qual é o seu nome?',
      welcomeText: 'A loja chama você pelo nome e imprime a senha do pedido.',
      doneTitle: 'Pedido na fila',
      doneHint: 'Guarde a senha. A loja chama você quando ficar pronto.',
      footerKiosk: 'Escolha o lanche, confirme e retire o ticket. A cozinha recebe na fila.',
      footerCatalog: 'Toque nas fotos para ver o cardápio. Este totem só exibe os itens.',
      footerNamed: 'Diga o nome, peça e retire o ticket. A loja chama quando ficar pronto.',
      showInstallments: false,
      showBrandFilters: false,
      previewItems: [
        { name: 'X-Burguer', price: 'R$ 18,90' },
        { name: 'Suco natural', price: 'R$ 9,00' },
        { name: 'Café', price: 'R$ 6,50' },
        { name: 'Combo', price: 'R$ 24,90' },
      ],
    },
  },
  {
    id: 'retail',
    title: 'Livraria e papelaria',
    text: 'Muitos SKUs na mesma tela. Catálogo por padrão, 4 cards por linha.',
    preset: {
      mode: 'catalog',
      columns: 4,
      showAttractScreen: true,
      askCustomerName: false,
      offerFulfillment: false,
      printTicket: false,
      audioAssist: false,
      keyboardPlacement: 'top',
      attractGradientColor: '#166534',
      shareStockWithErp: true,
    },
    copy: {
      kioskSubtitle: 'Retire no balcão',
      catalogSubtitle: 'Catálogo da loja',
      searchPlaceholder: 'Buscar título ou produto',
      nextButton: 'Reservar',
      confirmButton: 'Confirmar reserva',
      sendingButton: 'Enviando…',
      welcomeTitle: 'Qual é o seu nome?',
      welcomeText: 'Usamos o nome na reserva para separar o item no balcão.',
      doneTitle: 'Reserva enviada',
      doneHint: 'O balcão já recebeu. Retire com o nome ou a senha.',
      footerKiosk: 'Escolha o item e confirme. A loja separa no balcão.',
      footerCatalog: 'Toque nas fotos para folhear. Este totem é a vitrine da loja.',
      footerNamed: 'Informe o nome, escolha o item e confirme a reserva.',
      showInstallments: false,
      showBrandFilters: false,
      previewItems: [
        { name: 'Livro', price: 'R$ 49,90' },
        { name: 'Caderno', price: 'R$ 22,00' },
        { name: 'Caneta', price: 'R$ 8,50' },
        { name: 'Agenda', price: 'R$ 34,90' },
      ],
    },
  },
  {
    id: 'phones',
    title: 'Celular e eletrônicos',
    text: 'Card maior, proposta para o vendedor, filtros de marca. Como o totem de celular hoje.',
    preset: {
      mode: 'kiosk',
      columns: 2,
      showAttractScreen: true,
      askCustomerName: false,
      offerFulfillment: false,
      printTicket: false,
      audioAssist: false,
      keyboardPlacement: 'top',
      attractGradientColor: '#1e3a8a',
      shareStockWithErp: true,
    },
    copy: {
      kioskSubtitle: 'Quiosque de venda · Shopping',
      catalogSubtitle: 'Catálogo da loja',
      searchPlaceholder: 'Buscar modelo',
      nextButton: 'Próximo',
      confirmButton: 'Enviar proposta para a loja',
      sendingButton: 'Enviando…',
      welcomeTitle: 'Qual é o seu nome?',
      welcomeText: 'Usamos só para o vendedor te chamar com a proposta.',
      doneTitle: 'Proposta enviada',
      doneHint: 'O representante da loja recebeu seu interesse.',
      footerKiosk: 'Escolha o modelo, toque em Próximo e envie a proposta. O pedido cai na fila da loja.',
      footerCatalog: 'Toque nas fotos para passar o carrossel. Este totem é um catálogo da loja.',
      footerNamed: 'Informe o nome, escolha o modelo e envie a proposta.',
      showInstallments: true,
      showBrandFilters: true,
      previewItems: [
        { name: 'iPhone 16', price: 'R$ 6.290' },
        { name: 'iPhone 15', price: 'R$ 4.499' },
        { name: 'iPhone 14', price: 'R$ 3.899' },
        { name: 'Redmi Note', price: 'R$ 1.899' },
      ],
    },
  },
  {
    id: 'optics',
    title: 'Ótica e joalheria',
    text: 'Um card grande por linha, vitrine de destaque, áudio para ler o item.',
    preset: {
      mode: 'kiosk',
      columns: 1,
      showAttractScreen: true,
      askCustomerName: false,
      offerFulfillment: false,
      printTicket: false,
      audioAssist: true,
      keyboardPlacement: 'top',
      attractGradientColor: '#9f1239',
      shareStockWithErp: true,
    },
    copy: {
      kioskSubtitle: 'Vitrine da loja',
      catalogSubtitle: 'Catálogo da loja',
      searchPlaceholder: 'Buscar modelo',
      nextButton: 'Tenho interesse',
      confirmButton: 'Enviar para o atendente',
      sendingButton: 'Enviando…',
      welcomeTitle: 'Qual é o seu nome?',
      welcomeText: 'O atendente chama você para experimentar o item.',
      doneTitle: 'Atendente avisado',
      doneHint: 'Alguém da loja já recebeu e vai te atender.',
      footerKiosk: 'Escolha o item e envie. Um atendente recebe na fila.',
      footerCatalog: 'Toque nas fotos para ver os detalhes. Este totem é a vitrine.',
      footerNamed: 'Informe o nome, escolha o item e chame o atendente.',
      showInstallments: true,
      showBrandFilters: false,
      previewItems: [
        { name: 'Armação', price: 'R$ 420,00' },
        { name: 'Óculos sol', price: 'R$ 680,00' },
        { name: 'Lente', price: 'R$ 250,00' },
        { name: 'Estojo', price: 'R$ 39,90' },
      ],
    },
  },
];

const STORAGE_KEY = 'marthi.totem.settings.v1';
export const TOTEM_SETTINGS_EVENT = 'marthi-totem-settings';

export const DEFAULT_ATTRACT_GRADIENT = '#0f766e';

export const ATTRACT_COLOR_PRESETS: { hex: string; label: string }[] = [
  { hex: '#0f766e', label: 'Verde loja' },
  { hex: '#b45309', label: 'Âmbar' },
  { hex: '#9f1239', label: 'Vinho' },
  { hex: '#1e3a8a', label: 'Azul' },
  { hex: '#166534', label: 'Floresta' },
  { hex: '#18181b', label: 'Grafite' },
];

const DEFAULT_EXIT = import.meta.env.VITE_TOTEM_EXIT_PASSWORD?.trim() || 'cellponto';

let memorySettings: TotemSettings | null = null;

function verticalMeta(id: TotemVertical) {
  return TOTEM_VERTICALS.find((item) => item.id === id) ?? TOTEM_VERTICALS[0];
}

export function defaultTotemSettings(): TotemSettings {
  const general = verticalMeta('general');
  return {
    mode: general.preset.mode,
    exitPassword: DEFAULT_EXIT,
    shareStockWithErp: false,
    vertical: 'general',
    columns: general.preset.columns,
    showAttractScreen: true,
    storeName: 'Sua Loja',
    storeLogo: null,
    attractBackground: null,
    attractGradientColor: DEFAULT_ATTRACT_GRADIENT,
    attractLayout: 'standard',
    keyboardPlacement: 'bottom',
    askCustomerName: general.preset.askCustomerName,
    offerFulfillment: general.preset.offerFulfillment,
    printTicket: general.preset.printTicket,
    audioAssist: general.preset.audioAssist,
    storeWhatsApp: '',
    notifyCustomerOnLead: false,
    locationLabel: '',
  };
}

export function verticalPreset(id: TotemVertical): VerticalPreset {
  return { ...verticalMeta(id).preset };
}

export function totemCopy(vertical: TotemVertical): TotemCopy {
  return verticalMeta(vertical).copy;
}

function normalizeExitPassword(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_EXIT;
  const trimmed = value.trim();
  return trimmed || DEFAULT_EXIT;
}

export function normalizeAttractLayout(value: unknown): TotemAttractLayout {
  return value === 'logoPromo' ? 'logoPromo' : 'standard';
}

export function normalizeKeyboardPlacement(value: unknown): TotemKeyboardPlacement {
  return value === 'top' ? 'top' : 'bottom';
}

export function normalizeColumns(value: unknown): TotemColumns {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return 2;
}

export function normalizeVertical(value: unknown): TotemVertical {
  if (value === 'food' || value === 'retail' || value === 'phones' || value === 'optics' || value === 'general') {
    return value;
  }
  return 'general';
}

export function normalizeHexColor(value: unknown, fallback = DEFAULT_ATTRACT_GRADIENT): string {
  if (typeof value !== 'string') return fallback;
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgbChannel(hex: string): string {
  const n = parseInt(normalizeHexColor(hex).slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function normalizeDataImage(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
}

export function normalizeTotemSettings(parsed: Partial<TotemSettings> | null | undefined): TotemSettings {
  const storeName = typeof parsed?.storeName === 'string' ? parsed.storeName.trim() : '';
  const storeLogo = normalizeDataImage(parsed?.storeLogo);
  return {
    mode: parsed?.mode === 'catalog' ? 'catalog' : 'kiosk',
    exitPassword: normalizeExitPassword(parsed?.exitPassword),
    shareStockWithErp: Boolean(parsed?.shareStockWithErp),
    vertical: normalizeVertical(parsed?.vertical),
    columns: normalizeColumns(parsed?.columns),
    showAttractScreen: parsed?.showAttractScreen !== false,
    storeName: storeName || 'Sua Loja',
    storeLogo,
    attractBackground: normalizeDataImage(parsed?.attractBackground),
    attractGradientColor: normalizeHexColor(parsed?.attractGradientColor),
    attractLayout: normalizeAttractLayout(parsed?.attractLayout),
    keyboardPlacement: normalizeKeyboardPlacement(parsed?.keyboardPlacement),
    askCustomerName: Boolean(parsed?.askCustomerName),
    offerFulfillment: Boolean(parsed?.offerFulfillment),
    printTicket: Boolean(parsed?.printTicket),
    audioAssist: Boolean(parsed?.audioAssist),
    storeWhatsApp: normalizeWhatsAppDigits(parsed?.storeWhatsApp),
    notifyCustomerOnLead: Boolean(parsed?.notifyCustomerOnLead),
    locationLabel: typeof parsed?.locationLabel === 'string' ? parsed.locationLabel.trim().slice(0, 80) : '',
  };
}

function normalizeWhatsAppDigits(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '').slice(0, 15);
}

function readStored(): Partial<TotemSettings> | null {
  if (memorySettings) return { ...memorySettings };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TotemSettings>;
  } catch {
    return null;
  }
}

function read(): TotemSettings {
  return normalizeTotemSettings(readStored() ?? defaultTotemSettings());
}

/** Campos que o Nest já aceita em PUT /store/totem-settings. */
function toApiTotemSettings(settings: TotemSettings): Partial<TotemSettings> {
  return {
    mode: settings.mode,
    exitPassword: settings.exitPassword,
    shareStockWithErp: settings.shareStockWithErp,
  };
}

function mergeTotemSettings(base: Partial<TotemSettings> | null, patch: Partial<TotemSettings>): TotemSettings {
  return normalizeTotemSettings({
    ...base,
    ...patch,
    vertical: patch.vertical ?? base?.vertical,
    columns: patch.columns ?? base?.columns,
    showAttractScreen: patch.showAttractScreen ?? base?.showAttractScreen,
    storeName: patch.storeName ?? base?.storeName,
    storeLogo: patch.storeLogo !== undefined ? patch.storeLogo : base?.storeLogo,
    attractBackground: patch.attractBackground !== undefined ? patch.attractBackground : base?.attractBackground,
    attractGradientColor: patch.attractGradientColor ?? base?.attractGradientColor,
    attractLayout: patch.attractLayout ?? base?.attractLayout,
    keyboardPlacement: patch.keyboardPlacement ?? base?.keyboardPlacement,
    askCustomerName: patch.askCustomerName ?? base?.askCustomerName,
    offerFulfillment: patch.offerFulfillment ?? base?.offerFulfillment,
    printTicket: patch.printTicket ?? base?.printTicket,
    audioAssist: patch.audioAssist ?? base?.audioAssist,
    storeWhatsApp: patch.storeWhatsApp ?? base?.storeWhatsApp,
    notifyCustomerOnLead: patch.notifyCustomerOnLead ?? base?.notifyCustomerOnLead,
    locationLabel: patch.locationLabel ?? base?.locationLabel,
  });
}

export function getTotemSettings() {
  return read();
}

export function getTotemExitPassword() {
  return read().exitPassword;
}

export function replaceTotemSettings(input: Partial<TotemSettings>) {
  const next = mergeTotemSettings(readStored(), input);
  memorySettings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error('A imagem é grande demais para este navegador. Use um arquivo menor.');
  }
  window.dispatchEvent(new Event(TOTEM_SETTINGS_EVENT));
  return next;
}

export async function saveTotemSettings(input: Partial<TotemSettings>) {
  const next = mergeTotemSettings(read(), input);
  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const { apiPutTotemSettings } = await import('../services/erpApi');
    const saved = await apiPutTotemSettings(toApiTotemSettings(next));
    return replaceTotemSettings({
      ...next,
      ...saved,
      vertical: saved.vertical ?? next.vertical,
      columns: saved.columns ?? next.columns,
      showAttractScreen: saved.showAttractScreen ?? next.showAttractScreen,
      storeName: saved.storeName ?? next.storeName,
      storeLogo: saved.storeLogo ?? next.storeLogo,
      attractBackground: saved.attractBackground ?? next.attractBackground,
      attractGradientColor: saved.attractGradientColor ?? next.attractGradientColor,
      attractLayout: saved.attractLayout ?? next.attractLayout,
      keyboardPlacement: saved.keyboardPlacement ?? next.keyboardPlacement,
      askCustomerName: saved.askCustomerName ?? next.askCustomerName,
      offerFulfillment: saved.offerFulfillment ?? next.offerFulfillment,
      printTicket: saved.printTicket ?? next.printTicket,
      audioAssist: saved.audioAssist ?? next.audioAssist,
      storeWhatsApp: saved.storeWhatsApp ?? next.storeWhatsApp,
      notifyCustomerOnLead: saved.notifyCustomerOnLead ?? next.notifyCustomerOnLead,
      locationLabel: saved.locationLabel ?? next.locationLabel,
    });
  }
  return replaceTotemSettings(next);
}

export function invalidateTotemSettingsMemory() {
  memorySettings = null;
}

export function storeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export async function fileToStoreLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 640;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Não foi possível ler a logo.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

export async function fileToAttractBackground(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Não foi possível ler a imagem de fundo.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.76);
}
