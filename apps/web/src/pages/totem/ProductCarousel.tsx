import { useEffect, useRef, useState, type PointerEvent } from 'react';

type ProductCarouselProps = {
  images: string[];
  alt: string;
  className?: string;
  autoPlayMs?: number;
  size?: 'card' | 'hero';
};

const AUTO_MS = 10_000;

/**
 * Produto sem foto (ou foto que não carregou): um cartão com o nome do produto no lugar do "Sem foto".
 * É desenhado na tela, não grava nada; a foto de verdade continua sendo a do cadastro.
 */
export function ProductNameCard({ name, size = 'card' }: { name: string; size?: 'card' | 'hero' }) {
  const clean = name.replace(/\s+/g, ' ').trim() || 'Produto';
  return (
    <span className={`totem-name-card totem-name-card--${size}`} role="img" aria-label={clean}>
      <svg className="totem-name-card__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6.5" y="2.5" width="11" height="19" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <strong className="totem-name-card__name">{clean}</strong>
    </span>
  );
}

export function ProductCarousel({
  images,
  alt,
  className = '',
  autoPlayMs = AUTO_MS,
  size = 'card',
}: ProductCarouselProps) {
  const slides = images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const paused = useRef(false);

  useEffect(() => {
    setIndex(0);
    setFailedImages(new Set());
  }, [slides.join('|')]);

  useEffect(() => {
    if (slides.length < 2 || !autoPlayMs) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      setIndex((current) => (current + 1) % slides.length);
    }, autoPlayMs);
    return () => window.clearInterval(timer);
  }, [slides.length, autoPlayMs]);

  if (slides.length === 0) {
    return <div className={`totem-carousel totem-carousel--${size} totem-carousel--empty ${className}`}><ProductNameCard name={alt} size={size} /></div>;
  }

  function go(delta: number) {
    setIndex((current) => (current + delta + slides.length) % slides.length);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    paused.current = true;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
      event.stopPropagation();
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    paused.current = false;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    event.stopPropagation();
    go(dx < 0 ? 1 : -1);
  }

  return (
    <div
      className={`totem-carousel totem-carousel--${size} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerStart.current = null;
        paused.current = false;
      }}
    >
      <div
        className="totem-carousel__track"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((src, slideIndex) => (
          <div className="totem-carousel__slide" key={`${src}-${slideIndex}`}>
            {failedImages.has(src) ? (
              <ProductNameCard name={alt} size={size} />
            ) : (
              <img src={src} alt={`${alt} — foto ${slideIndex + 1}`} draggable={false} loading="lazy" decoding="async" onError={() => setFailedImages(current => new Set([...current, src]))} />
            )}
          </div>
        ))}
      </div>

      {slides.length > 1 ? (
        <div className="totem-carousel__dots" role="tablist" aria-label="Fotos do produto">
          {slides.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              className={`totem-carousel__dot ${dotIndex === index ? 'is-active' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setIndex(dotIndex);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
