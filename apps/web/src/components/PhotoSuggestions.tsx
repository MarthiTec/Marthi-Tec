import { useEffect, useState } from 'react';
import { nestGet } from '../services/nestClient';
import './photoSuggestions.css';

export type ImageSuggestion = { url: string; thumbUrl: string; title: string; source: string; license: string; pageUrl: string };

export const apiImageSuggestions = (name: string, brand = '') =>
  nestGet<ImageSuggestion[]>(`/product-images/suggestions?name=${encodeURIComponent(name)}&brand=${encodeURIComponent(brand)}`);

/**
 * Produto sem foto que aparece no totem: sugestões de foto da web (iPhone: a oficial da Apple; demais:
 * Wikimedia Commons). Um toque usa a foto (entra como foto hospedada, por HTTPS); nada é baixado.
 */
export function PhotoSuggestions({ name, brand, onPick }: { name: string; brand?: string; onPick: (url: string) => void }) {
  const [items, setItems] = useState<ImageSuggestion[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const term = name.trim();

  useEffect(() => {
    if (term.length < 3) {
      setItems([]);
      setState('idle');
      return;
    }
    let alive = true;
    // Espera parar de digitar o nome antes de buscar.
    const timer = window.setTimeout(() => {
      setState('loading');
      apiImageSuggestions(term, brand ?? '')
        .then((list) => {
          if (!alive) return;
          setItems(list ?? []);
          setState('done');
        })
        .catch(() => alive && setState('error'));
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [term, brand]);

  if (state === 'idle') return null;
  return (
    <div className="photo-suggest">
      <p className="photo-suggest__title">
        Sem foto: o totem mostra o nome do produto. <strong>Sugestões da web</strong> — toque para usar.
      </p>
      {state === 'loading' ? <p className="photo-suggest__muted">Buscando fotos de “{term}”…</p> : null}
      {state === 'error' ? <p className="photo-suggest__muted">Não foi possível buscar fotos agora. Use “+ Foto” ou a foto hospedada.</p> : null}
      {state === 'done' && !items.length ? <p className="photo-suggest__muted">Nenhuma foto encontrada para “{term}”.</p> : null}
      {items.length ? (
        <div className="photo-suggest__grid">
          {items.map((item) => (
            <figure key={item.url} className="photo-suggest__item">
              <button type="button" className="photo-suggest__pick" onClick={() => onPick(item.url)} title={`Usar esta foto · ${item.title}`}>
                <img src={item.thumbUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" />
                <span className="photo-suggest__use">Usar esta foto</span>
              </button>
              <figcaption>
                <a href={item.pageUrl} target="_blank" rel="noreferrer">
                  {item.source}
                </a>
                {item.license ? <span> · {item.license}</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}
