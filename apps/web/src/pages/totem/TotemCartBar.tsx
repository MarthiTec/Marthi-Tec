import { useRef, useState, type PointerEvent } from 'react';
import { formatBRL } from './totemData';

const KNOB = 60;
const CONFIRM_AT = 0.82;

/** Trilho "arraste para finalizar": evita finalizar por um toque sem querer. */
export function TotemSwipeToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [drag, setDrag] = useState<{ start: number; base: number } | null>(null);
  const maxOffset = () => Math.max(0, (track.current?.clientWidth ?? 0) - KNOB - 8);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ start: event.clientX, base: offset });
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    setOffset(Math.max(0, Math.min(maxOffset(), drag.base + event.clientX - drag.start)));
  }

  function release() {
    if (!drag) return;
    setDrag(null);
    const max = maxOffset();
    if (max > 0 && offset >= max * CONFIRM_AT) {
      setOffset(max);
      window.setTimeout(() => {
        onConfirm();
        setOffset(0);
      }, 160);
    } else {
      setOffset(0);
    }
  }

  const progress = maxOffset() ? offset / maxOffset() : 0;

  return (
    <div ref={track} className="totem-swipe">
      <span className="totem-swipe__fill" style={{ width: offset + KNOB + 4 }} aria-hidden />
      <span className="totem-swipe__label" style={{ opacity: 1 - progress }}>
        {label}
        <span className="totem-swipe__chevrons" aria-hidden>
          ›››
        </span>
      </span>
      <button
        type="button"
        className="totem-swipe__knob"
        aria-label={label}
        style={{ transform: `translateX(${offset}px)`, transition: drag ? 'none' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={(event) => {
          // Teclado / leitor de tela não arrastam: Enter ou espaço confirmam direto.
          if (event.detail === 0) onConfirm();
        }}
      >
        →
      </button>
    </div>
  );
}

/** Rodapé do carrinho: quantos itens, total e o botão (ou trilho) para finalizar. */
export function TotemCartBar({
  count,
  total,
  gesture,
  onOpen,
  onFinish,
}: {
  count: number;
  total: number;
  gesture: 'button' | 'swipe';
  onOpen: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="totem-cartbar" role="region" aria-label="Carrinho">
      <button type="button" className="totem-cartbar__summary" onClick={onOpen}>
        <span className="totem-cartbar__badge" key={count} aria-hidden>
          {count}
        </span>
        <span className="totem-cartbar__text">
          <small>{count === 1 ? '1 item no carrinho' : `${count} itens no carrinho`}</small>
          <strong>{formatBRL(total)}</strong>
        </span>
      </button>
      {gesture === 'swipe' ? (
        <TotemSwipeToConfirm label="Arraste para finalizar" onConfirm={onFinish} />
      ) : (
        <button type="button" className="totem-cartbar__finish" onClick={onFinish}>
          Finalizar pedido
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
