import { useEffect, useRef, useState, type PointerEvent } from 'react';

const SLIDE_MS = 6000;

/**
 * Propaganda / imagem em destaque no topo da vitrine. Com mais de uma imagem vira carrossel:
 * troca sozinho a cada 6 s e o cliente pode arrastar para o lado ou tocar nos pontos.
 */
export function TotemTopBanner({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragStart = useRef<number | null>(null);
  const count = images.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [count, index, paused]);

  if (!count) return null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = event.clientX;
    setPaused(true);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    setPaused(false);
    if (start === null || count < 2) return;
    const delta = event.clientX - start;
    if (Math.abs(delta) < 40) return;
    setIndex((current) => (delta < 0 ? (current + 1) % count : (current - 1 + count) % count));
  }

  return (
    <div
      className="totem-banner"
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragStart.current = null;
        setPaused(false);
      }}
    >
      <div className="totem-banner__track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {images.map((src, slide) => (
          <img
            key={slide}
            src={src}
            alt=""
            className="totem-banner__slide"
            draggable={false}
            aria-hidden={slide !== index}
          />
        ))}
      </div>
      {count > 1 ? (
        <div className="totem-banner__dots">
          {images.map((_, dot) => (
            <button
              key={dot}
              type="button"
              className={dot === index ? 'is-active' : ''}
              aria-label={`Mostrar destaque ${dot + 1}`}
              onClick={(event) => {
                event.stopPropagation();
                setIndex(dot);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
