import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CatalogDocument } from '../components/CatalogDocument';
import { apiPublicSalesCatalog } from '../services/salesCatalogApi';

type Loaded = Awaited<ReturnType<typeof apiPublicSalesCatalog>>;

/** Catálogo que o cliente abre pelo link (sem login). Com ?imprimir=1 abre a impressão / PDF. */
export function CatalogPublicPage() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiPublicSalesCatalog(token)
      .then((result) => {
        if (!alive) return;
        setData(result);
        document.title = `${result.catalog.title} · ${result.store.name}`.trim();
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Catálogo indisponível.'));
    return () => {
      alive = false;
    };
  }, [token]);

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

  if (error) {
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
  return (
    <main style={{ minHeight: '100dvh', background: '#f3f4f6' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <CatalogDocument look={data.catalog} store={data.store} items={data.items} />
      </div>
    </main>
  );
}
