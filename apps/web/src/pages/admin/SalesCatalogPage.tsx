import { useEffect, useMemo, useRef, useState } from 'react';
import { useUserPreference } from '../../hooks/useUserPreference';
import { AdminPicker } from '../../components/AdminPicker';
import { AdminIcon } from '../../components/AdminIcons';
import { CatalogDocument, type CatalogItem, type CatalogStore } from '../../components/CatalogDocument';
import { QrCodeView, generateQrDataUrl } from '../../components/QrCodeView';
import { conditionCode } from '../../data/productCondition';
import { usePickupMethods } from '../../data/pickup';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { apiListStock } from '../../services/erpApi';
import { apiListProductGroups, type ProductGroup } from '../../services/productCatalogApi';
import {
  apiCreateSalesCatalog,
  apiDeleteSalesCatalog,
  apiListSalesCatalogs,
  apiNewSalesCatalogLink,
  apiPreviewSalesCatalog,
  apiUpdateSalesCatalog,
  catalogShareUrl,
  type SalesCatalog,
  type SalesCatalogInput,
} from '../../services/salesCatalogApi';
import './salesCatalog.css';

type StockRow = {
  id: string;
  name: string;
  brand?: string;
  images?: string[];
  price: number;
  qty: number;
  groupId?: string;
  condition?: string;
  active?: boolean;
  pickupPrices?: Record<string, number | null>;
  variations?: Array<{ price?: number; qty?: number; condition?: string; pickupPrices?: Record<string, number | null> }>;
};

const ACCENTS = ['#e4572e', '#0f766e', '#1d4ed8', '#7c3aed', '#db2777', '#16181d'];
const blank = (): SalesCatalogInput => ({
  title: 'Catálogo',
  subtitle: 'Novidades da loja',
  showCover: true,
  coverStyle: 'hero',
  mode: 'sales',
  coverImage: '',
  accent: ACCENTS[0],
  showPrices: true,
  hideSoldOut: true,
  includeOrderProducts: true,
  showRepairs: true,
  featuredIds: [],
  note: '',
  productIds: [],
  publicSlug: '',
});
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Quantidade em estoque (produto ou soma das variações). */
const stockQty = (row: StockRow) => (row.variations?.length ? row.variations.reduce((sum, v) => sum + (Number(v.qty) || 0), 0) : Number(row.qty) || 0);
const priceRange = (row: StockRow) => {
  const prices = (row.variations ?? []).map((v) => Number(v.price) || 0).filter((p) => p > 0);
  if (!prices.length) return money(Number(row.price) || 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
};
const isUsed = (row: StockRow) =>
  (row.variations?.length ? row.variations.map((v) => conditionCode(v.condition) || 'new') : [conditionCode(row.condition) || 'new']).some((code) => code !== 'new');

type Tab = 'products' | 'look' | 'share' | 'preview';
type Availability = 'available' | 'stock' | 'order' | 'all';
type Condition = 'all' | 'new' | 'used';
/** Configuração da tela de cada usuário (fica no banco): catálogo aberto, aba e filtros. */
const SCREEN = { currentId: '', tab: 'products', query: '', groupId: '', brand: '', condition: 'all', availability: 'available', onlyPhoto: false, onlyMarked: false };

const COVER_STYLES: Array<[SalesCatalogInput['coverStyle'], string]> = [
  ['hero', 'Destaque'],
  ['minimal', 'Minimal'],
  ['mosaic', 'Mosaico'],
  ['dark', 'Escura'],
  ['diagonal', 'Diagonal'],
  ['band', 'Faixa'],
];

/**
 * Catálogo digital (painel do lojista): marcar os produtos com filtro, escolher capa e cor, usar como
 * catálogo (vitrine) ou página de venda (sacola e pedido), pré-visualizar e mandar o link ou o PDF.
 * O catálogo e a configuração da tela ficam no banco.
 */
export function SalesCatalogPage() {
  const [catalogs, setCatalogs] = useState<SalesCatalog[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [form, setForm] = useState<SalesCatalogInput>(blank);
  const { value: screen, update: setScreen, loaded: screenLoaded } = useUserPreference('sales-catalog.screen', SCREEN);
  const [listLoaded, setListLoaded] = useState(false);
  const opened = useRef(false);
  /** Último estado gravado no banco (para salvar sozinho só quando mudar algo). */
  const lastSaved = useRef('');
  /** Gerações do auto-save: ignora resposta atrasada depois de Salvar manual. */
  const saveGen = useRef(0);
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [stock, setStock] = useState<StockRow[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [preview, setPreview] = useState<{ store: CatalogStore; items: CatalogItem[] } | null>(null);
  const tab = screen.tab as Tab;
  const setTab = (value: Tab) => setScreen({ tab: value });
  const query = String(screen.query ?? '');
  const setQuery = (value: string) => setScreen({ query: value });
  const groupId = String(screen.groupId ?? '');
  const setGroupId = (value: string) => setScreen({ groupId: value });
  const brand = String(screen.brand ?? '');
  const setBrand = (value: string) => setScreen({ brand: value });
  const condition = screen.condition as Condition;
  const setCondition = (value: Condition) => setScreen({ condition: value });
  /** Disponível = tem estoque ou aceita encomenda (produto sob encomenda aparece mesmo sem unidade na loja). */
  const availability = screen.availability as Availability;
  const setAvailability = (value: Availability) => setScreen({ availability: value });
  const { methods: pickupMethods } = usePickupMethods();
  const orderMethodId = pickupMethods.find((method) => method.kind === 'order' && method.active)?.id ?? '';
  /** Mesma regra do servidor: só aceita encomenda quando "Sob encomenda" está marcado na variação (ou no produto). */
  const orderable = (row: StockRow) => {
    if (!orderMethodId) return false;
    const lines = row.variations?.length ? row.variations : [{}];
    return lines.some((v: { pickupPrices?: Record<string, number | null> }) => {
      const own = v.pickupPrices && Object.keys(v.pickupPrices).length ? v.pickupPrices : row.pickupPrices ?? {};
      return Object.prototype.hasOwnProperty.call(own, orderMethodId) && own[orderMethodId] !== null;
    });
  };
  const onlyPhoto = Boolean(screen.onlyPhoto);
  const setOnlyPhoto = (value: boolean) => setScreen({ onlyPhoto: value });
  const onlyMarked = Boolean(screen.onlyMarked);
  const setOnlyMarked = (value: boolean) => setScreen({ onlyMarked: value });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const current = catalogs.find((catalog) => catalog.id === currentId) ?? null;

  useEffect(() => {
    const load = () => {
      setError('');
      opened.current = false;
      setListLoaded(false);
      Promise.all([apiListSalesCatalogs(), apiListStock(), apiListProductGroups().catch(() => ({ groups: [] as ProductGroup[] }))])
        .then(([list, items, groupData]) => {
          setCatalogs(list);
          setStock((items as unknown as StockRow[]).filter((item) => item.active !== false));
          setGroups(groupData.groups ?? []);
          setListLoaded(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os produtos.'));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, []);

  // Abre o catálogo em que a pessoa estava (configuração salva no banco) ou o mais recente.
  useEffect(() => {
    if (!listLoaded || !screenLoaded || opened.current) return;
    opened.current = true;
    const saved = catalogs.find((item) => item.id === screen.currentId) ?? catalogs[0];
    if (saved) open(saved);
    else {
      setCurrentId('');
      setForm(blank());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listLoaded, screenLoaded, catalogs]);

  // Catálogo já criado: cada mudança é salva sozinha no banco (sem precisar clicar em Salvar).
  useEffect(() => {
    if (!currentId) return;
    const json = JSON.stringify(form);
    if (json === lastSaved.current) return;
    const id = currentId;
    const payload = form;
    const gen = saveGen.current;
    const timer = window.setTimeout(() => {
      if (json === lastSaved.current || gen !== saveGen.current) return;
      setAutoState('saving');
      apiUpdateSalesCatalog(id, payload)
        .then((saved) => {
          if (gen !== saveGen.current) return;
          const synced = { ...payload, publicSlug: saved.publicSlug || payload.publicSlug || '' };
          lastSaved.current = JSON.stringify(synced);
          setForm((current) => (JSON.stringify(current) === json ? synced : current));
          setCatalogs((list) => list.map((item) => (item.id === saved.id ? saved : item)));
          setError('');
          setAutoState('saved');
        })
        .catch((err) => {
          if (gen !== saveGen.current) return;
          setAutoState('idle');
          setError(err instanceof Error ? err.message : 'Não foi possível salvar o catálogo.');
        });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [form, currentId]);

  // Prévia ao vivo com os dados do servidor (preço, variações e bateria como o cliente vai ver).
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      apiPreviewSalesCatalog(form.productIds, form.hideSoldOut, form.includeOrderProducts)
        .then((data) => alive && setPreview(data))
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [form.productIds, form.hideSoldOut, form.includeOrderProducts]);

  function open(catalog: SalesCatalog) {
    setCurrentId(catalog.id);
    const { id: _id, token: _token, createdBy: _by, createdAt: _c, updatedAt: _u, ...input } = catalog;
    const next = { ...blank(), ...input };
    lastSaved.current = JSON.stringify(next);
    setForm(next);
    setAutoState('idle');
    setNotice('');
    if (screen.currentId !== catalog.id) setScreen({ currentId: catalog.id });
  }

  const update = (patch: Partial<SalesCatalogInput>) => setForm((value) => ({ ...value, ...patch }));
  const marked = useMemo(() => new Set(form.productIds), [form.productIds]);
  const brands = useMemo(() => [...new Set(stock.map((row) => row.brand).filter(Boolean) as string[])].sort(), [stock]);

  const filtered = useMemo(() => {
    const term = norm(query.trim());
    return stock.filter((row) => {
      if (onlyMarked && !marked.has(row.id)) return false;
      if (term && !norm(`${row.name} ${row.brand ?? ''}`).includes(term)) return false;
      if (groupId && row.groupId !== groupId) return false;
      if (brand && row.brand !== brand) return false;
      if (condition === 'used' && !isUsed(row)) return false;
      if (condition === 'new' && isUsed(row) && !(row.variations ?? []).some((v) => (conditionCode(v.condition) || 'new') === 'new')) return false;
      const inStock = stockQty(row) > 0;
      if (availability === 'available' && !inStock && !orderable(row)) return false;
      if (availability === 'stock' && !inStock) return false;
      if (availability === 'order' && (inStock || !orderable(row))) return false;
      if (onlyPhoto && !row.images?.length) return false;
      return true;
    });
  }, [stock, query, groupId, brand, condition, availability, orderMethodId, onlyPhoto, onlyMarked, marked]);

  const featured = useMemo(() => new Set(form.featuredIds ?? []), [form.featuredIds]);
  /** Destaque: faixa no topo da página de venda (até 12); destacar também marca o produto. */
  const toggleFeatured = (id: string) => {
    const list = form.featuredIds ?? [];
    if (list.includes(id)) return update({ featuredIds: list.filter((x) => x !== id) });
    if (list.length >= 12) return setNotice('No máximo 12 destaques.');
    update({ featuredIds: [...list, id], productIds: marked.has(id) ? form.productIds : [...form.productIds, id] });
  };
  const toggle = (id: string) => update({ productIds: marked.has(id) ? form.productIds.filter((x) => x !== id) : [...form.productIds, id] });
  const markAll = () => update({ productIds: [...form.productIds, ...filtered.map((row) => row.id).filter((id) => !marked.has(id))] });
  const unmarkFiltered = () => {
    const out = new Set(filtered.map((row) => row.id));
    update({ productIds: form.productIds.filter((id) => !out.has(id)) });
  };
  /** Fotos para a capa: de todos os produtos que aparecem no catálogo (marcados e os sob encomenda que entram sozinhos). */
  const coverChoices = useMemo(() => {
    const fromPreview = (preview?.items ?? []).filter((item) => item.image).map((item) => ({ id: item.id, name: item.name, image: item.image! }));
    const fromMarked = form.productIds
      .map((id) => stock.find((row) => row.id === id))
      .filter((row): row is StockRow => Boolean(row?.images?.[0]))
      .map((row) => ({ id: row.id, name: row.name, image: row.images![0] }));
    const seen = new Set<string>();
    return [...fromPreview, ...fromMarked].filter((row) => !seen.has(row.image) && Boolean(seen.add(row.image)));
  }, [preview, form.productIds, stock]);

  async function save() {
    setBusy(true);
    setError('');
    saveGen.current += 1;
    const gen = saveGen.current;
    try {
      const saved = currentId ? await apiUpdateSalesCatalog(currentId, form) : await apiCreateSalesCatalog(form);
      if (gen !== saveGen.current) return saved;
      const synced = { ...form, publicSlug: saved.publicSlug || form.publicSlug || '' };
      lastSaved.current = JSON.stringify(synced);
      setForm(synced);
      setCatalogs((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
      setCurrentId(saved.id);
      setScreen({ currentId: saved.id });
      setNotice('Catálogo salvo.');
      setAutoState('saved');
      return saved;
    } catch (err) {
      if (gen === saveGen.current) setError(err instanceof Error ? err.message : 'Não foi possível salvar o catálogo.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Abre a página do cliente (salva antes, para o link mostrar exatamente o que está na tela). */
  async function openPublic(print = false) {
    const saved = await save();
    if (!saved) return;
    const url = catalogShareUrl(saved);
    if (!url) {
      setError('Salve o catálogo com um link curto (ou gere um novo link) antes de pré-visualizar.');
      return;
    }
    window.open(`${url}${print ? '?imprimir=1' : ''}`, '_blank', 'noopener');
  }
  async function copyLink() {
    const saved = await save();
    if (!saved) return;
    const url = catalogShareUrl(saved);
    if (!url) {
      setError('Salve o catálogo com um link curto antes de copiar.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copiado. Cole no WhatsApp, Instagram ou imprima o QR.');
    } catch {
      setNotice(`Link: ${url}`);
    }
  }
  async function sendWhatsapp() {
    const saved = await save();
    if (!saved) return;
    const url = catalogShareUrl(saved);
    if (!url) {
      setError('Salve o catálogo com um link curto antes de enviar.');
      return;
    }
    const text = `${saved.title}${saved.subtitle ? ` · ${saved.subtitle}` : ''}\nVeja nossos produtos: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
  async function downloadQr() {
    const saved = await save();
    if (!saved) return;
    const url = catalogShareUrl(saved);
    if (!url) {
      setError('Salve o catálogo com um link curto antes de gerar o QR Code.');
      return;
    }
    try {
      const dataUrl = await generateQrDataUrl(url, 600);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `marthi-catalogo-qr-${saved.publicSlug || saved.id}.png`;
      a.click();
      setNotice('QR Code baixado em PNG (alta resolução).');
    } catch {
      setError('Não foi possível gerar o QR Code.');
    }
  }
  async function newLink() {
    if (!current || !window.confirm('Gerar um novo link? O link antigo para de abrir.')) return;
    try {
      const saved = await apiNewSalesCatalogLink(current.id);
      setCatalogs((list) => list.map((item) => (item.id === saved.id ? saved : item)));
      setNotice('Novo link gerado; o antigo não abre mais.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o link.');
    }
  }
  async function remove() {
    if (!current || !window.confirm(`Excluir o catálogo "${current.title}"? O link dele para de abrir.`)) return;
    try {
      await apiDeleteSalesCatalog(current.id);
      const rest = catalogs.filter((item) => item.id !== current.id);
      setCatalogs(rest);
      if (rest[0]) open(rest[0]);
      else {
        setCurrentId('');
        setForm(blank());
      }
      setNotice('Catálogo excluído.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }

  const previewNode = preview ? (
    <CatalogDocument look={form} store={preview.store} items={preview.items} />
  ) : (
    <p className="salescat__muted">Carregando a prévia…</p>
  );

  return (
    <section className="admin-page salescat">
      <header className="salescat__head">
        <div>
          <h1>Catálogo digital</h1>
          <p className="salescat__muted">Marque os produtos, escolha a capa e mande o link — como catálogo (vitrine) ou página de venda. Foto, preço, cor, capacidade e bateria sempre atualizados do estoque.</p>
        </div>
        <div className="salescat__pick">
          <AdminPicker
            label="Catálogo"
            value={currentId || '__new'}
            options={[...catalogs.map((item) => ({ value: item.id, label: item.title + (item.subtitle ? ` · ${item.subtitle}` : '') })), { value: '__new', label: '＋ Novo catálogo' }]}
            onChange={(value) => {
              if (value === '__new') {
                setCurrentId('');
                setForm(blank());
                setScreen({ currentId: '' });
              } else {
                const found = catalogs.find((item) => item.id === value);
                if (found) open(found);
              }
            }}
          />
        </div>
      </header>

      <div className="salescat__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
          <AdminIcon name="clipboard" /> {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void openPublic()} title="Abre o catálogo como o cliente vai ver">
          <AdminIcon name="search" /> Pré-visualizar
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void sendWhatsapp()}>
          <AdminIcon name="whatsapp" /> WhatsApp
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void copyLink()}>
          <AdminIcon name="layers" /> Copiar link
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void openPublic(true)}>
          <AdminIcon name="print" /> Imprimir / PDF
        </button>
        {current ? (
          <>
            <button type="button" className="btn btn--ghost" onClick={() => void newLink()} title="O link antigo para de abrir">
              <AdminIcon name="sync" /> Novo link
            </button>
            <button type="button" className="btn btn--ghost salescat__danger" onClick={() => void remove()}>
              <AdminIcon name="trash" /> Excluir
            </button>
          </>
        ) : null}
      </div>
      <p className="salescat__autosave" role="status">
        {currentId
          ? autoState === 'saving'
            ? 'Salvando…'
            : autoState === 'saved'
              ? '✓ Alterações salvas automaticamente'
              : 'As alterações são salvas automaticamente.'
          : 'Catálogo novo: clique em Salvar para criar. Depois, tudo é salvo sozinho.'}
      </p>
      {error ? <p role="alert" className="salescat__error">{error}</p> : null}
      {notice ? <p role="status" className="salescat__notice">{notice}</p> : null}

      <div className="salescat__tabs" role="tablist">
        {(
          [
            ['products', `Produtos (${form.productIds.length})`],
            ['look', 'Uso, capa e aparência'],
            ['share', 'Link e QR Code'],
            ['preview', 'Prévia'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={`salescat__tab${tab === value ? ' is-on' : ''}${value === 'preview' ? ' salescat__tab--preview' : ''}`} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className={`salescat__layout is-${tab}`}>
        <div className="salescat__editor">
          {tab === 'products' ? (
            <div className="salescat__panel">
              <div className="salescat__filters">
                <input type="search" className="admin-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produto ou marca…" aria-label="Buscar produto" />
                <AdminPicker label="Grupo" value={groupId} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} onChange={setGroupId} />
                <AdminPicker label="Marca" value={brand} options={[{ value: '', label: 'Todas as marcas' }, ...brands.map((b) => ({ value: b, label: b }))]} onChange={setBrand} />
                <AdminPicker
                  label="Disponibilidade"
                  value={availability}
                  options={[
                    { value: 'available', label: 'Em estoque ou sob encomenda' },
                    { value: 'stock', label: 'Só em estoque' },
                    { value: 'order', label: 'Só sob encomenda' },
                    { value: 'all', label: 'Todos (até os esgotados)' },
                  ]}
                  onChange={(value) => setAvailability(value as typeof availability)}
                />
                <AdminPicker
                  label="Condição"
                  value={condition}
                  options={[
                    { value: 'all', label: 'Novos e usados' },
                    { value: 'new', label: 'Novos' },
                    { value: 'used', label: 'Usados / seminovos' },
                  ]}
                  onChange={(value) => setCondition(value as typeof condition)}
                />
              </div>
              <div className="salescat__checks">
                <label>
                  <input type="checkbox" checked={onlyPhoto} onChange={(e) => setOnlyPhoto(e.target.checked)} /> Só com foto
                </label>
                <label>
                  <input type="checkbox" checked={onlyMarked} onChange={(e) => setOnlyMarked(e.target.checked)} /> Só marcados
                </label>
              </div>
              <div className="salescat__bulk">
                <span>
                  {filtered.length} na lista · <strong>{form.productIds.length} marcados</strong>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={markAll} disabled={!filtered.length}>
                  Marcar todos da lista
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={unmarkFiltered} disabled={!filtered.some((row) => marked.has(row.id))}>
                  Desmarcar da lista
                </button>
              </div>
              <ul className="salescat__list">
                {filtered.map((row) => (
                  <li key={row.id} className="salescat__item">
                    <label className={`salescat__row${marked.has(row.id) ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={marked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Exibir ${row.name} no catálogo`} />
                      <span className="salescat__thumb">{row.images?.[0] ? <img src={row.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{row.name.slice(0, 1)}</span>}</span>
                      <span className="salescat__info">
                        <strong>{row.name}</strong>
                        <small>
                          {priceRange(row)} · {stockQty(row) > 0 ? `${stockQty(row)} em estoque${orderable(row) ? ' · aceita encomenda' : ''}` : orderable(row) ? 'sob encomenda' : 'esgotado'}
                          {isUsed(row) ? ' · usado' : ''}
                          {!row.images?.length ? ' · sem foto' : ''}
                        </small>
                      </span>
                    </label>
                    <button
                      type="button"
                      className={`salescat__star${featured.has(row.id) ? ' is-on' : ''}`}
                      aria-pressed={featured.has(row.id)}
                      title={featured.has(row.id) ? 'Tirar dos destaques' : 'Colocar nos destaques (faixa no topo)'}
                      onClick={() => toggleFeatured(row.id)}
                    >
                      {featured.has(row.id) ? '★' : '☆'}
                    </button>
                  </li>
                ))}
                {!filtered.length ? <li className="salescat__muted">Nenhum produto com esses filtros.</li> : null}
              </ul>
            </div>
          ) : null}

          {tab === 'look' ? (
            <div className="salescat__panel salescat__look">
              <div>
                <span className="admin-label">Como o cliente vai usar este link</span>
                <div className="salescat__modes" role="radiogroup" aria-label="Uso do link">
                  {(
                    [
                      ['catalog', 'Catálogo digital', 'Vitrine: o cliente vê os produtos e chama no WhatsApp ("Tenho interesse").'],
                      ['sales', 'Página de venda', 'Loja online: sacola, escolha do vendedor e da forma de pagamento; o pedido cai na fila da venda externa.'],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button key={value} type="button" role="radio" aria-checked={(form.mode ?? 'sales') === value} className={`salescat__mode${(form.mode ?? 'sales') === value ? ' is-on' : ''}`} onClick={() => update({ mode: value })}>
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label className="admin-field">
                Título
                <input className="admin-input" maxLength={60} value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="Catálogo" />
              </label>
              <label className="admin-field">
                Subtítulo
                <input className="admin-input" maxLength={80} value={form.subtitle} onChange={(e) => update({ subtitle: e.target.value })} placeholder="Ex.: Novidades da semana · Seminovos com garantia" />
              </label>
              <label className="salescat__switch">
                <input type="checkbox" checked={form.showCover} onChange={(e) => update({ showCover: e.target.checked })} /> Com capa
              </label>
              {form.showCover ? (
                <>
                  <div className="salescat__styles" role="radiogroup" aria-label="Estilo da capa">
                    {COVER_STYLES.map(([value, label]) => (
                      <button key={value} type="button" role="radio" aria-checked={form.coverStyle === value} className={`salescat__style salescat__style--${value}${form.coverStyle === value ? ' is-on' : ''}`} style={{ ['--cat-accent' as string]: form.accent }} onClick={() => update({ coverStyle: value })}>
                        <span aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <span className="admin-label">Foto da capa</span>
                    <div className="salescat__covers">
                      <button type="button" className={`salescat__cover${!form.coverImage ? ' is-on' : ''}`} onClick={() => update({ coverImage: '' })}>
                        Automática
                      </button>
                      <button type="button" className={`salescat__cover${form.coverImage === 'none' ? ' is-on' : ''}`} onClick={() => update({ coverImage: 'none' })}>
                        Sem foto
                      </button>
                      {coverChoices.map((row) => (
                        <button key={row.id} type="button" title={row.name} className={`salescat__cover${form.coverImage === row.image ? ' is-on' : ''}`} onClick={() => update({ coverImage: row.image })}>
                          <img src={row.image} alt={row.name} referrerPolicy="no-referrer" />
                        </button>
                      ))}
                    </div>
                    {!coverChoices.length ? <small className="salescat__muted">Marque produtos com foto para escolher a da capa.</small> : null}
                  </div>
                </>
              ) : null}
              <div>
                <span className="admin-label">Cor de destaque</span>
                <div className="salescat__accents">
                  {ACCENTS.map((color) => (
                    <button key={color} type="button" className={`salescat__accent${form.accent === color ? ' is-on' : ''}`} style={{ background: color }} aria-label={`Cor ${color}`} onClick={() => update({ accent: color })} />
                  ))}
                  <input type="color" value={form.accent} onChange={(e) => update({ accent: e.target.value })} aria-label="Outra cor" />
                </div>
              </div>
              <label className="salescat__switch">
                <input type="checkbox" checked={form.showPrices} onChange={(e) => update({ showPrices: e.target.checked })} /> Mostrar preços
              </label>
              <label className="salescat__switch">
                <input type="checkbox" checked={form.hideSoldOut} onChange={(e) => update({ hideSoldOut: e.target.checked })} /> Esconder o que esgotar
              </label>
              <label className="salescat__switch">
                <input type="checkbox" checked={form.includeOrderProducts} onChange={(e) => update({ includeOrderProducts: e.target.checked })} /> Incluir sempre os produtos sob encomenda (mesmo sem marcar, inclusive os novos)
              </label>
              <label className="salescat__switch">
                <input type="checkbox" checked={form.showRepairs !== false} onChange={(e) => update({ showRepairs: e.target.checked })} /> Mostrar “Solicitar manutenção” (serviços do Catálogo de manutenções da OS)
              </label>
              <label className="admin-field">
                Observação no rodapé
                <textarea className="admin-input" rows={2} maxLength={300} value={form.note} onChange={(e) => update({ note: e.target.value })} placeholder="Ex.: Preços à vista no PIX. Parcelamos em até 18x no cartão." />
              </label>
            </div>
          ) : null}

          {tab === 'share' ? (
            <div className="salescat__panel salescat__share">
              <div>
                <h2 className="salescat__share-title">Link curto e QR Code</h2>
                <p className="salescat__muted">
                  Use na mesa, no balcão ou em material impresso. O cliente aponta a câmera e abre o catálogo da loja — no mesmo padrão do Cardápio Digital.
                </p>
              </div>

              <label className="admin-field">
                Link curto (slug)
                <div className="salescat__slug-row">
                  <span className="salescat__slug-prefix">{typeof window !== 'undefined' ? `${window.location.origin}/c/` : '/c/'}</span>
                  <input
                    className="admin-input"
                    maxLength={48}
                    value={form.publicSlug ?? ''}
                    onChange={(e) =>
                      update({
                        publicSlug: e.target.value
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[^a-z0-9-]+/g, '-')
                          .replace(/-+/g, '-')
                          .replace(/^-|-$/g, '')
                          .slice(0, 48),
                      })
                    }
                    placeholder="minha-loja"
                    aria-label="Slug do link curto"
                    disabled={!currentId}
                  />
                </div>
                <small className="salescat__muted">Letras, números e hífens. Salva com o catálogo. Ex.: /c/cellponto</small>
              </label>

              {currentId && catalogShareUrl({ token: current?.token || '', publicSlug: form.publicSlug || current?.publicSlug }) ? (
                <>
                  <div className="salescat__share-card salescat__share-card--qr">
                    <div className="salescat__qr">
                      <QrCodeView
                        value={catalogShareUrl({ token: current?.token || '', publicSlug: form.publicSlug || current?.publicSlug })}
                        size={140}
                        colorDark="#16181d"
                      />
                    </div>
                    <div className="salescat__share-copy">
                      <strong>QR Code para mesa e fachada</strong>
                      <p className="salescat__muted">
                        Link público:{' '}
                        <code className="salescat__code">
                          {catalogShareUrl({ token: current?.token || '', publicSlug: form.publicSlug || current?.publicSlug })}
                        </code>
                      </p>
                      <div className="salescat__share-btns">
                        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void downloadQr()}>
                          Baixar só QR (PNG)
                        </button>
                        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void copyLink()}>
                          Copiar link
                        </button>
                        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void openPublic()}>
                          Abrir catálogo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="salescat__share-card">
                    <strong>Propaganda com capa + QR</strong>
                    <p className="salescat__muted">
                      Escolha a foto de capa e imprima o flyer com o QR do link curto — como o display do Cardápio Digital.
                    </p>
                    <div className="salescat__share-btns">
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={busy}
                        onClick={() => {
                          void save().then((saved) => {
                            if (saved) window.location.assign(`/painel/catalogo/imprimir?id=${encodeURIComponent(saved.id)}`);
                          });
                        }}
                      >
                        Abrir propaganda / imprimir
                      </button>
                    </div>
                  </div>

                  <div className="salescat__share-card">
                    <strong>WhatsApp e redes</strong>
                    <p className="salescat__muted">Envie o link curto aos clientes ou cole na bio do Instagram.</p>
                    <div className="salescat__share-btns">
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void sendWhatsapp()}>
                        <AdminIcon name="whatsapp" /> WhatsApp
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busy}
                        onClick={() => {
                          void copyLink();
                        }}
                      >
                        Copiar para a bio
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="salescat__muted">Salve o catálogo para gerar o link curto e o QR Code. Catálogos já salvos recebem o slug automaticamente.</p>
              )}
            </div>
          ) : null}
        </div>
        <aside className="salescat__preview" aria-label="Prévia do catálogo">
          {previewNode}
        </aside>
      </div>
    </section>
  );
}
