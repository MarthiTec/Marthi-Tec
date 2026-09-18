import { useEffect, type RefObject } from 'react';

const SKIP = 'button, a, select, input, textarea, label, .totem-carousel__dot';

export function useDragScroll(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller || !enabled) return;
    const el = scroller;

    let pointerId: number | null = null;
    let startY = 0;
    let startTop = 0;
    let dragging = false;

    function onDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(SKIP)) return;

      pointerId = event.pointerId;
      startY = event.clientY;
      startTop = el.scrollTop;
      dragging = false;
      el.classList.add('is-drag-ready');
    }

    function onMove(event: PointerEvent) {
      if (pointerId !== event.pointerId) return;
      const dy = event.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 8) return;
        dragging = true;
        el.classList.add('is-dragging');
        try {
          el.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      event.preventDefault();
      el.scrollTop = startTop - dy;
    }

    function onUp(event: PointerEvent) {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      dragging = false;
      el.classList.remove('is-dragging', 'is-drag-ready');
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
    };
  }, [ref, enabled]);
}
