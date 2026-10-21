import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { QrCodeView, generateQrDataUrl } from '../../components/QrCodeView';
import {
  apiListSalesCatalogs,
  apiPreviewSalesCatalog,
  catalogShareUrl,
  type SalesCatalog,
} from '../../services/salesCatalogApi';
import type { CatalogItem, CatalogStore } from '../../components/CatalogDocument';
import {
  captureFlyerPngBlob,
  downloadFlyerPngBlob,
  flyerCssBackground,
  inlineFlyerImage,
  waitForFlyerImages,
} from '../../utils/catalogFlyerExport';
import './catalogPromoPrint.css';

type CoverChoice = { id: string; label: string; image: string };

/**
 * Propaganda / flyer do Catálogo Digital (espelha o display do Cardápio):
 * escolhe a capa, gera o cartaz com QR do link curto e imprime ou baixa PNG.
 * O download “só QR” permanece disponível.
 */
export function CatalogPromoPrintPage() {
  const [params] = useSearchParams();
  const flyerRef = useRef<HTMLElement | null>(null);
  const [catalogs, setCatalogs] = useState<SalesCatalog[]>([]);
  const [catalogId, setCatalogId] = useState(params.get('id') || '');
  const [store, setStore] = useState<CatalogStore | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [cover, setCover] = useState('');
  /** Origem escolhida na grade (antes do inline HTTPS→data) — mantém o highlight. */
  const [coverOrigin, setCoverOrigin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const catalog = catalogs.find((item) => item.id === catalogId) ?? catalogs[0] ?? null;

  useEffect(() => {
    apiListSalesCatalogs()
      .then((list) => {
        setCatalogs(list);
        if (!catalogId && list[0]) setCatalogId(list[0].id);
        else if (catalogId && !list.some((item) => item.id === catalogId) && list[0]) setCatalogId(list[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os catálogos.'));
  }, []);

  useEffect(() => {
    if (!catalog) return;
    let alive = true;
    const preferredCover = catalog.coverImage && catalog.coverImage !== 'none' ? catalog.coverImage : '';
    apiPreviewSalesCatalog(catalog.productIds, catalog.hideSoldOut, catalog.includeOrderProducts)
      .then((data) => {
        if (!alive) return;
        setStore(data.store);
        setItems(data.items);
        const fallback = preferredCover || data.items.find((item) => item.image)?.image || '';
        setCover(fallback);
        setCoverOrigin(fallback);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // Recarrega prévia e capa ao trocar de catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog?.id]);

  const covers = useMemo(() => {
    const list: CoverChoice[] = [];
    const seen = new Set<string>();
    const push = (id: string, label: string, image: string) => {
      if (!image || image === 'none' || seen.has(image)) return;
      seen.add(image);
      list.push({ id, label, image });
    };
    if (catalog?.coverImage && catalog.coverImage !== 'none') push('catalog-cover', 'Capa do catálogo', catalog.coverImage);
    for (const item of items) if (item.image) push(item.id, item.name, item.image);
    return list;
  }, [catalog?.coverImage, items]);

  const shareUrl = catalog ? catalogShareUrl(catalog) : '';
  const accent = catalog?.accent || '#e4572e';
  const cssCover = flyerCssBackground(cover);

  function selectCover(image: string) {
    setCover(image);
    setCoverOrigin(image);
  }

  function onUpload(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCover(reader.result);
        setCoverOrigin(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  /** Inline capa + logo HTTPS → data URL (canvas/print sem CORS e sem data: no CSS). */
  async function prepareFlyerImages() {
    const flyer = flyerRef.current;
    if (!flyer) return;

    const nextCover = cover ? await inlineFlyerImage(cover) : '';
    if (nextCover && nextCover !== cover) {
      setCover(nextCover);
      // Aplica no DOM já — não espera o re-render do React antes do html2canvas/print.
      flyer.querySelectorAll<HTMLImageElement>('.catpromo__art-photo').forEach((img) => {
        img.removeAttribute('crossorigin');
        img.src = nextCover;
      });
      flyer.style.backgroundImage = '';
      flyer.querySelectorAll<HTMLElement>('.catpromo__art').forEach((el) => {
        el.style.backgroundImage = '';
      });
    }

    const logo = store?.logo;
    if (logo && !logo.startsWith('data:')) {
      const nextLogo = await inlineFlyerImage(logo);
      if (nextLogo && nextLogo !== logo) {
        setStore((current) => (current ? { ...current, logo: nextLogo } : current));
        flyer.querySelectorAll<HTMLImageElement>('.catpromo__logo').forEach((img) => {
          img.removeAttribute('crossorigin');
          img.src = nextLogo;
        });
      }
    }

    await waitForFlyerImages(flyer);
  }

  async function downloadQrOnly() {
    if (!shareUrl || !catalog) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await generateQrDataUrl(shareUrl, 600);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `marthi-catalogo-qr-${catalog.publicSlug || catalog.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setNotice('QR Code baixado (só o código).');
    } catch {
      setError('Não foi possível baixar o QR Code.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadFlyerPng() {
    if (!flyerRef.current || !catalog) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await prepareFlyerImages();
      if (!flyerRef.current) throw new Error('Prévia indisponível.');
      const blob = await captureFlyerPngBlob(flyerRef.current);
      downloadFlyerPngBlob(blob, catalog.publicSlug || catalog.id);
      setNotice('Propaganda baixada em PNG.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar a propaganda. Tente imprimir.');
    } finally {
      setBusy(false);
    }
  }

  async function printFlyer() {
    if (!flyerRef.current || !catalog) return;
    setBusy(true);
    setError('');
    try {
      await prepareFlyerImages();
      window.print();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível preparar a impressão.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="catpromo">
      <div className="catpromo__controls no-print">
        <div className="catpromo__controls-head">
          <div>
            <h1>Propaganda do Catálogo</h1>
            <p>Escolha a capa, confira o QR do link curto e imprima o flyer — no mesmo espírito do display do Cardápio Digital.</p>
          </div>
          <Link to="/painel/catalogo" className="btn btn--ghost">
            ← Voltar ao catálogo
          </Link>
        </div>

        {error ? (
          <p role="alert" className="catpromo__error">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="catpromo__notice">
            {notice}
          </p>
        ) : null}

        <div className="catpromo__fields">
          <div className="catpromo__field">
            <AdminPicker
              label="Catálogo"
              value={catalog?.id || ''}
              options={catalogs.map((item) => ({
                value: item.id,
                label: item.title + (item.subtitle ? ` · ${item.subtitle}` : ''),
              }))}
              onChange={(value) => {
                setCatalogId(value);
                setCover('');
                setCoverOrigin('');
              }}
            />
          </div>
        </div>

        <div>
          <span className="admin-label">Capa da propaganda</span>
          <div className="catpromo__covers">
            {covers.map((row) => (
              <button
                key={row.id}
                type="button"
                title={row.label}
                className={`catpromo__cover${coverOrigin === row.image || cover === row.image ? ' is-on' : ''}`}
                onClick={() => selectCover(row.image)}
              >
                <img src={row.image} alt={row.label} referrerPolicy="no-referrer" />
              </button>
            ))}
            <label className="catpromo__cover catpromo__cover--upload">
              <span>Enviar foto</span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  onUpload(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {!covers.length ? <small className="catpromo__muted">Marque produtos com foto no catálogo ou envie uma imagem.</small> : null}
        </div>

        <div className="catpromo__actions">
          <button type="button" className="btn btn--primary" disabled={!catalog || busy} onClick={() => void printFlyer()}>
            Imprimir propaganda
          </button>
          <button type="button" className="btn btn--ghost" disabled={!catalog || busy || !cover} onClick={() => void downloadFlyerPng()}>
            Baixar flyer (PNG)
          </button>
          <button type="button" className="btn btn--ghost" disabled={!catalog || busy} onClick={() => void downloadQrOnly()}>
            Baixar só QR (PNG)
          </button>
        </div>
      </div>

      {catalog ? (
        <article
          ref={flyerRef}
          className="catpromo__flyer"
          style={{
            ['--cat-accent' as string]: accent,
            // background-image só para HTTPS curto — data: enorme no CSS quebra o print do Chrome.
            ...(cssCover
              ? {
                  backgroundImage: cssCover,
                  backgroundSize: 'cover' as const,
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat' as const,
                }
              : {}),
          }}
          aria-label="Prévia da propaganda"
        >
          <div
            className="catpromo__art"
            aria-hidden
            style={
              cssCover
                ? {
                    backgroundImage: cssCover,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }
                : undefined
            }
          >
            {cover ? (
              <img
                className="catpromo__art-photo"
                src={cover}
                alt=""
                decoding="sync"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="catpromo__art-empty" />
            )}
            <span className="catpromo__scrim" />
          </div>

          <header className="catpromo__brand">
            {store?.logo ? (
              <img className="catpromo__logo" src={store.logo} alt="" decoding="sync" referrerPolicy="no-referrer" />
            ) : (
              <span className="catpromo__mono">{(store?.name || catalog.title).slice(0, 1)}</span>
            )}
            <div>
              <strong>{store?.name || 'Sua loja'}</strong>
              <small>{catalog.title}</small>
            </div>
          </header>

          <section className="catpromo__copy">
            <p className="catpromo__kicker">Aponte a câmera e</p>
            <h2>Veja nosso catálogo</h2>
            {catalog.subtitle ? <p className="catpromo__sub">{catalog.subtitle}</p> : <p className="catpromo__sub">Novidades, seminovos e ofertas da loja.</p>}
          </section>

          <div className="catpromo__qr-wrap">
            <div className="catpromo__qr">
              {shareUrl ? <QrCodeView value={shareUrl} size={168} colorDark="#16181d" colorLight="#ffffff" /> : null}
            </div>
            <span className="catpromo__scan">Escaneie para abrir</span>
            {catalog.publicSlug ? <code className="catpromo__slug">/c/{catalog.publicSlug}</code> : null}
          </div>

          <footer className="catpromo__foot">
            {[store?.instagram ? `@${store.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')}` : '', store?.phone]
              .filter(Boolean)
              .join(' · ') || 'Catálogo digital Marthi'}
          </footer>
        </article>
      ) : (
        <p className="catpromo__muted no-print">Carregando catálogo…</p>
      )}
    </div>
  );
}
