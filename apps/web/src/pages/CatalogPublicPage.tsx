import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CatalogDocument, catalogMoney, type CatalogItem, type CatalogVariant } from '../components/CatalogDocument';
import { CatalogCheckout, type BagLine, type CheckoutMode } from '../components/CatalogCheckout';
import { CatalogProductSheet } from '../components/CatalogProductSheet';
import { apiPublicSalesCatalog } from '../services/salesCatalogApi';
import { CatalogRepairFlow } from '../components/CatalogRepairFlow';
import { CatalogHome, type HomeShopIntent } from '../components/CatalogHome';
import { apiPublicRepairBrands } from '../services/repairsApi';

type Loaded = Awaited<ReturnType<typeof apiPublicSalesCatalog>>;
const REFRESH_MS = 45_000;
const VERSION_CHECK_MS = 5 * 60_000;

/** Saiu uma versão nova do Marthi? (o arquivo principal do site mudou desde que a página abriu) */
async function newVersionAvailable() {
  const mine = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src;
  if (!mine) return false;
  const html = await (await fetch('/', { cache: 'no-store' })).text();
  const live = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
  return Boolean(live) && new URL(live!, window.location.origin).href !== mine;
}

/** Mesma variação = mesma linha da sacola. */
const lineKey = (item: CatalogItem, variant: CatalogVariant | null) => `${item.id}|${(variant?.attributes ?? []).map((a) => `${a.id}=${a.value}`).join(',')}`;

/**
 * Catálogo que o cliente abre pelo link (sem login), pensado para o celular: ver os produtos, montar
 * a sacola e enviar o pedido (ou só o cadastro / os dados do Upgrade) para a fila da loja; ou baixar o
 * PDF. Preço e disponibilidade se atualizam sozinhos (o produto pode ser vendido a qualquer momento).
 * Com ?imprimir=1 abre direto a impressão / PDF.
 */
export function CatalogPublicPage() {
  const { token: tokenParam = '', slug = '' } = useParams();
  /** Token longo (/catalogo/…) ou slug curto (/c/…). A API resolve os dois. */
  const token = tokenParam || slug;
  const [params] = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [bag, setBag] = useState<BagLine[]>([]);
  const [checkout, setCheckout] = useState<CheckoutMode | null>(null);
  /** Produto aberto (página do produto). */
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  /** Comprar produtos | Solicitar manutenção (só aparece se a loja tem serviços no Catálogo de manutenções). */
  /** Início (escolha), Catálogo ou Manutenção. Links com ?manutencao=1 / ?catalogo=1 (ou PDF) abrem direto. */
  const [tab, setTab] = useState<'home' | 'shop' | 'repair'>(() =>
    params.get('manutencao') === '1' ? 'repair' : params.get('catalogo') === '1' || params.get('imprimir') === '1' ? 'shop' : 'home',
  );
  const [shopIntent, setShopIntent] = useState<HomeShopIntent & { key: number }>({ key: 0 });
  const [repairView, setRepairView] = useState<'form' | 'track'>('form');
  const go = (next: 'home' | 'shop' | 'repair') => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [repairBrands, setRepairBrands] = useState<Array<{ brand: string; models: string[] }>>([]);
  useEffect(() => {
    let alive = true;
    apiPublicRepairBrands(token)
      .then((result) => alive && setRepairBrands(result.brands))
      .catch(() => alive && setRepairBrands([]));
    return () => {
      alive = false;
    };
  }, [token]);
  const toastTimer = useRef<number | undefined>(undefined);

  const load = useCallback(
    () =>
      apiPublicSalesCatalog(token)
        .then((result) => {
          setData(result);
          setError('');
          document.title = `${result.catalog.title} · ${result.store.name}`.trim();
          // A sacola acompanha o estoque: preço novo, e o que esgotou sai.
          setBag((lines) =>
            lines.flatMap((line) => {
              const item = result.items.find((entry) => entry.id === line.item.id);
              if (!item || item.soldOut) return [];
              if (!line.variant) return [{ ...line, item }];
              const variant = item.variants.find((entry) => lineKey(item, entry) === line.key);
              return variant && variant.availability !== 'sold_out' ? [{ ...line, item, variant }] : [];
            }),
          );
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Catálogo indisponível.')),
    [token],
  );

  // Página aberta há tempo (cliente ou loja): quando o Marthi atualiza, recarrega sozinha para o visual
  // ficar igual ao configurado — só se não houver nada na sacola nem pedido/produto aberto.
  const idle = useRef(true);
  idle.current = !bag.length && !checkout && !openId && tab !== 'repair';
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || !idle.current) return;
      void newVersionAvailable()
        .then((fresh) => fresh && idle.current && window.location.reload())
        .catch(() => undefined);
    }, VERSION_CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const onVisible = () => !document.hidden && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!data || params.get('imprimir') !== '1') return;
    // Espera as fotos carregarem para a impressão sair completa.
    const images = [...document.images].filter((img) => !img.complete);
    let done = false;
    const print = () => {
      if (done) return;
      done = true;
      window.print();
    };
    if (!images.length) {
      window.setTimeout(print, 300);
      return;
    }
    let pending = images.length;
    images.forEach((img) => {
      const finish = () => (pending -= 1) <= 0 && print();
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
    });
    const fallback = window.setTimeout(print, 6000);
    return () => window.clearTimeout(fallback);
  }, [data, params]);

  function add(item: CatalogItem, variant: CatalogVariant | null) {
    const key = lineKey(item, variant);
    setBag((lines) => (lines.some((line) => line.key === key) ? lines.map((line) => (line.key === key ? { ...line, qty: Math.min(3, line.qty + 1) } : line)) : [...lines, { key, item, variant, qty: 1 }]));
    setToast(`${item.name}${variant?.label ? ` (${variant.label})` : ''} na sacola`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2200);
  }

  if (error && !data) {
    return (
      <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#f3f4f6', color: '#16181d', textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.3rem' }}>Catálogo indisponível</h1>
          <p style={{ color: '#6b7280' }}>{error}</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#f3f4f6', color: '#6b7280' }}>Carregando catálogo…</main>;
  }
  /** Página de venda tem sacola; o catálogo digital é vitrine (o cliente chama a loja no WhatsApp). */
  const sells = data.catalog.mode !== 'catalog';
  const count = bag.reduce((sum, line) => sum + line.qty, 0);
  const total = bag.reduce((sum, line) => sum + (line.variant?.price ?? line.item.price) * line.qty, 0);
  return (
    <main style={{ minHeight: '100dvh', background: '#f3f4f6', paddingBottom: count ? 88 : 0 }}>
      <nav className="cnav" aria-label="Navegação da loja" style={{ ['--cat-accent' as string]: data.catalog.accent }}>
        <div className="cnav__bar" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'home'} className={tab === 'home' ? 'is-on' : ''} onClick={() => go('home')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
            </svg>
            Início
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'shop'}
            className={tab === 'shop' ? 'is-on' : ''}
            onClick={() => {
              setShopIntent((current) => ({ key: current.key + 1 }));
              go('shop');
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 8h12l-1 12H7L6 8z" />
              <path d="M9 8V6a3 3 0 0 1 6 0v2" />
            </svg>
            Catálogo
          </button>
          {repairBrands.length ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'repair'}
              className={tab === 'repair' ? 'is-on' : ''}
              onClick={() => {
                setRepairView('form');
                go('repair');
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z" />
              </svg>
              Manutenção
            </button>
          ) : null}
        </div>
      </nav>
      {tab === 'home' ? (
        <CatalogHome
          look={data.catalog}
          store={data.store}
          items={data.items}
          hasRepairs={repairBrands.length > 0}
          canBuy={sells}
          onShop={(intent) => {
            setShopIntent((current) => ({ ...intent, key: current.key + 1 }));
            go('shop');
          }}
          onRepair={() => {
            setRepairView('form');
            go('repair');
          }}
          onTrack={() => {
            setRepairView('track');
            go('repair');
          }}
          onOpenItem={(item) => setOpenId(item.id)}
          onSignup={() => setCheckout('signup')}
        />
      ) : tab === 'repair' && repairBrands.length ? (
        <div style={{ padding: 12 }}>
          <CatalogRepairFlow key={repairView} token={token} brands={repairBrands} store={data.store} accent={data.catalog.accent} initialView={repairView} />
        </div>
      ) : (
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <CatalogDocument
            key={shopIntent.key}
            look={data.catalog}
            store={data.store}
            items={data.items}
            initialQuery={shopIntent.query}
            initialBrand={shopIntent.brand}
            initialFilter={shopIntent.filter}
            shop={{ canBuy: sells, onAdd: add, onOpen: (item) => setOpenId(item.id), onUpgrade: () => setCheckout('upgrade'), onSignup: () => setCheckout('signup'), onPdf: () => window.print() }}
          />
        </div>
      )}
      {openId && data.items.find((item) => item.id === openId) ? (
        <CatalogProductSheet
          item={data.items.find((item) => item.id === openId)!}
          look={data.catalog}
          store={data.store}
          onAdd={(item, variant) => {
            add(item, variant);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
          canBuy={sells}
        />
      ) : null}
      {count && !checkout && !openId ? (
        <div className="catalog-bagbar" style={{ ['--cat-accent' as string]: data.catalog.accent }}>
          <span>
            {count} {count === 1 ? 'item' : 'itens'} · {catalogMoney(total)}
          </span>
          <button type="button" onClick={() => setCheckout('order')}>
            Finalizar pedido
          </button>
        </div>
      ) : null}
      {toast && !checkout ? (
        <div className="catalog-toast" role="status">
          {toast}
        </div>
      ) : null}
      {checkout ? (
        <CatalogCheckout
          token={token}
          mode={checkout}
          accent={data.catalog.accent}
          store={data.store}
          sellers={data.sellers ?? []}
          bag={checkout === 'order' ? bag : []}
          onBagChange={setBag}
          onClose={() => setCheckout(null)}
          onDone={() => {
            setCheckout(null);
            void load();
          }}
        />
      ) : null}
    </main>
  );
}
