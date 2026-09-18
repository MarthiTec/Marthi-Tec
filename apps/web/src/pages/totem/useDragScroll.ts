import { useEffect, type RefObject } from 'react';

const SKIP = 'button, a, select, input, textarea, label, .totem-carousel__nav, .totem-carousel__dot';

export function useDragScroll(ref: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller || !enabled) return;

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
      startTop = scroller.scrollTop;
      dragging = false;
      scroller.classList.add('is-drag-ready');
    }

    function onMove(event: PointerEvent) {
      if (pointerId !== event.pointerId) return;
      const dy = event.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) < 8) return;
        dragging = true;
        scroller.classList.add('is-dragging');
        try {
          scroller.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      event.preventDefault();
      scroller.scrollTop = startTop - dy;
    }

    function onUp(event: PointerEvent) {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      dragging = false;
      scroller.classList.remove('is-dragging', 'is-drag-ready');
    }

    scroller.addEventListener('pointerdown', onDown);
    scroller.addEventListener('pointermove', onMove, { passive: false });
    scroller.addEventListener('pointerup', onUp);
    scroller.addEventListener('pointercancel', onUp);
    scroller.addEventListener('lostpointercapture', onUp);

    return () => {
      scroller.removeEventListener('pointerdown', onDown);
      scroller.removeEventListener('pointermove', onMove);
      scroller.removeEventListener('pointerup', onUp);
      scroller.removeEventListener('pointercancel', onUp);
      scroller.removeEventListener('lostpointercapture', onUp);
    };
  }, [ref, enabled]);
}
