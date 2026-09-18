import { useEffect, useRef, useState } from 'react';

type ProductCarouselProps = {
  images: string[];
  alt: string;
  className?: string;
  autoPlayMs?: number;
  size?: 'card' | 'hero';
};

export function ProductCarousel({
  images,
  alt,
  className = '',
  autoPlayMs = 4200,
  size = 'card',
}: ProductCarouselProps) {
  const slides = images.length > 0 ? images : [];
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const paused = useRef(false);

  useEffect(() => {
    setIndex(0);
  }, [slides.join('|')]);

  useEffect(() => {
    if (slides.length < 2 || !autoPlayMs) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      setIndex((current) => (current + 1) % slides.length);
    }, autoPlayMs);
    return () => window.clearInterval(timer);
  }, [slides.length, autoPlayMs]);

  if (slides.length === 0) {
    return <div className={`totem-carousel totem-carousel--empty ${className}`} />;
  }

  function go(delta: number) {
    setIndex((current) => (current + delta + slides.length) % slides.length);
  }

  return (
    <div
      className={`totem-carousel totem-carousel--${size} ${className}`}
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
        paused.current = true;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        paused.current = false;
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        go(delta < 0 ? 1 : -1);
      }}
    >
      <div
        className="totem-carousel__track"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((src, slideIndex) => (
          <div className="totem-carousel__slide" key={`${src}-${slideIndex}`}>
            <img src={src} alt={`${alt} — foto ${slideIndex + 1}`} draggable={false} />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            className="totem-carousel__nav totem-carousel__nav--prev"
            aria-label="Imagem anterior"
            onClick={(event) => {
              event.stopPropagation();
              go(-1);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="totem-carousel__nav totem-carousel__nav--next"
            aria-label="Próxima imagem"
            onClick={(event) => {
              event.stopPropagation();
              go(1);
            }}
          >
            ›
          </button>
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
        </>
      )}
    </div>
  );
}
