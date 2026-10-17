import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { AdminIcon } from '../../components/AdminIcons';
import { CatalogDocument, type CatalogItem, type CatalogStore } from '../../components/CatalogDocument';
import { conditionCode } from '../../data/productCondition';
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
  catalogPublicUrl,
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
  variations?: Array<{ price?: number; qty?: number; condition?: string }>;
};

const ACCENTS = ['#e4572e', '#0f766e', '#1d4ed8', '#7c3aed', '#db2777', '#16181d'];
const blank = (): SalesCatalogInput => ({
  title: 'Catálogo',
  subtitle: 'Novidades da loja',
  showCover: true,
  coverStyle: 'diagonal',
  coverImage: '',
  accent: ACCENTS[0],
  showPrices: true,
  hideSoldOut: true,
  note: '',
  productIds: [],
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

/**
 * Catálogo para clientes (painel do lojista): marcar os produtos com filtro, escolher capa e cor,
 * pré-visualizar e mandar o link (WhatsApp) ou imprimir / salvar em PDF. Tudo salvo no banco.
 */
export function SalesCatalogPage() {
  const [catalogs, setCatalogs] = useState<SalesCatalog[]>([]);
  const [currentId, setCurrentId] = useState<string>('');
  const [form, setForm] = useState<SalesCatalogInput>(blank);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [preview, setPreview] = useState<{ store: CatalogStore; items: CatalogItem[] } | null>(null);
  const [tab, setTab] = useState<'products' | 'look' | 'preview'>('products');
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState<'all' | 'new' | 'used'>('all');
  const [onlyStock, setOnlyStock] = useState(true);
  const [onlyPhoto, setOnlyPhoto] = useState(false);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const current = catalogs.find((catalog) => catalog.id === currentId) ?? null;

  useEffect(() => {
    const load = () => {
      setError('');
      Promise.all([apiListSalesCatalogs(), apiListStock(), apiListProductGroups().catch(() => ({ groups: [] as ProductGroup[] }))])
        .then(([list, items, groupData]) => {
          setCatalogs(list);
          setStock((items as unknown as StockRow[]).filter((item) => item.active !== false));
          setGroups(groupData.groups ?? []);
          if (list[0]) open(list[0]);
          else {
            setCurrentId('');
            setForm(blank());
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os produtos.'));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, []);

  // Prévia ao vivo com os dados do servidor (preço, variações e bateria como o cliente vai ver).
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      apiPreviewSalesCatalog(form.productIds, form.hideSoldOut)
        .then((data) => alive && setPreview(data))
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [form.productIds, form.hideSoldOut]);

  function open(catalog: SalesCatalog) {
    setCurrentId(catalog.id);
    const { id: _id, token: _token, createdBy: _by, createdAt: _c, updatedAt: _u, ...input } = catalog;
    setForm(input);
    setNotice('');
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
      if (onlyStock && stockQty(row) <= 0) return false;
      if (onlyPhoto && !row.images?.length) return false;
      return true;
    });
  }, [stock, query, groupId, brand, condition, onlyStock, onlyPhoto, onlyMarked, marked]);

  const toggle = (id: string) => update({ productIds: marked.has(id) ? form.productIds.filter((x) => x !== id) : [...form.productIds, id] });
  const markAll = () => update({ productIds: [...form.productIds, ...filtered.map((row) => row.id).filter((id) => !marked.has(id))] });
  const unmarkFiltered = () => {
    const out = new Set(filtered.map((row) => row.id));
    update({ productIds: form.productIds.filter((id) => !out.has(id)) });
  };
  const coverChoices = useMemo(
    () => form.productIds.map((id) => stock.find((row) => row.id === id)).filter((row): row is StockRow => Boolean(row?.images?.[0])).slice(0, 12),
    [form.productIds, stock],
  );

  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = currentId ? await apiUpdateSalesCatalog(currentId, form) : await apiCreateSalesCatalog(form);
      setCatalogs((list) => [saved, ...list.filter((item) => item.id !== saved.id)]);
      setCurrentId(saved.id);
      setNotice('Catálogo salvo.');
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o catálogo.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Abre a página do cliente (salva antes, para o link mostrar exatamente o que está na tela). */
  async function openPublic(print = false) {
    const saved = await save();
    if (saved) window.open(`${catalogPublicUrl(saved.token)}${print ? '?imprimir=1' : ''}`, '_blank', 'noopener');
  }
  async function copyLink() {
    const saved = await save();
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(catalogPublicUrl(saved.token));
      setNotice('Link copiado. Cole no WhatsApp ou no Instagram do cliente.');
    } catch {
      setNotice(`Link: ${catalogPublicUrl(saved.token)}`);
    }
  }
  async function sendWhatsapp() {
    const saved = await save();
    if (!saved) return;
    const text = `${saved.title}${saved.subtitle ? ` · ${saved.subtitle}` : ''}\nVeja nossos produtos: ${catalogPublicUrl(saved.token)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
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
          <h1>Catálogo para clientes</h1>
          <p className="salescat__muted">Marque os produtos, escolha a capa e mande o link. Foto, preço, cor, capacidade e bateria sempre atualizados do estoque.</p>
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
      {error ? <p role="alert" className="salescat__error">{error}</p> : null}
      {notice ? <p role="status" className="salescat__notice">{notice}</p> : null}

      <div className="salescat__tabs" role="tablist">
        {(
          [
            ['products', `Produtos (${form.productIds.length})`],
            ['look', 'Capa e aparência'],
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
                  <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} /> Só com estoque
                </label>
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
                  <li key={row.id}>
                    <label className={`salescat__row${marked.has(row.id) ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={marked.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Exibir ${row.name} no catálogo`} />
                      <span className="salescat__thumb">{row.images?.[0] ? <img src={row.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{row.name.slice(0, 1)}</span>}</span>
                      <span className="salescat__info">
                        <strong>{row.name}</strong>
                        <small>
                          {priceRange(row)} · {stockQty(row)} em estoque{isUsed(row) ? ' · usado' : ''}
                          {!row.images?.length ? ' · sem foto' : ''}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
                {!filtered.length ? <li className="salescat__muted">Nenhum produto com esses filtros.</li> : null}
              </ul>
            </div>
          ) : null}

          {tab === 'look' ? (
            <div className="salescat__panel salescat__look">
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
                    {(
                      [
                        ['diagonal', 'Diagonal'],
                        ['band', 'Faixa central'],
                      ] as const
                    ).map(([value, label]) => (
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
                      {coverChoices.map((row) => (
                        <button key={row.id} type="button" title={row.name} className={`salescat__cover${form.coverImage === row.images![0] ? ' is-on' : ''}`} onClick={() => update({ coverImage: row.images![0] })}>
                          <img src={row.images![0]} alt={row.name} referrerPolicy="no-referrer" />
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
              <label className="admin-field">
                Observação no rodapé
                <textarea className="admin-input" rows={2} maxLength={300} value={form.note} onChange={(e) => update({ note: e.target.value })} placeholder="Ex.: Preços à vista no PIX. Parcelamos em até 18x no cartão." />
              </label>
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
