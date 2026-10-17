import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CatalogDocument, catalogMoney, type CatalogItem, type CatalogVariant } from '../components/CatalogDocument';
import { CatalogCheckout, type BagLine, type CheckoutMode } from '../components/CatalogCheckout';
import { apiPublicSalesCatalog } from '../services/salesCatalogApi';

type Loaded = Awaited<ReturnType<typeof apiPublicSalesCatalog>>;
const REFRESH_MS = 45_000;

/** Mesma variação = mesma linha da sacola. */
const lineKey = (item: CatalogItem, variant: CatalogVariant | null) => `${item.id}|${(variant?.attributes ?? []).map((a) => `${a.id}=${a.value}`).join(',')}`;

/**
 * Catálogo que o cliente abre pelo link (sem login), pensado para o celular: ver os produtos, montar
 * a sacola e enviar o pedido (ou só o cadastro / os dados do Upgrade) para a fila da loja; ou baixar o
 * PDF. Preço e disponibilidade se atualizam sozinhos (o produto pode ser vendido a qualquer momento).
 * Com ?imprimir=1 abre direto a impressão / PDF.
 */
export function CatalogPublicPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [bag, setBag] = useState<BagLine[]>([]);
  const [checkout, setCheckout] = useState<CheckoutMode | null>(null);
  const [toast, setToast] = useState('');
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
  const count = bag.reduce((sum, line) => sum + line.qty, 0);
  const total = bag.reduce((sum, line) => sum + (line.variant?.price ?? line.item.price) * line.qty, 0);
  return (
    <main style={{ minHeight: '100dvh', background: '#f3f4f6', paddingBottom: count ? 88 : 0 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <CatalogDocument
          look={data.catalog}
          store={data.store}
          items={data.items}
          shop={{ onAdd: add, onUpgrade: () => setCheckout('upgrade'), onSignup: () => setCheckout('signup'), onPdf: () => window.print() }}
        />
      </div>
      {count && !checkout ? (
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
