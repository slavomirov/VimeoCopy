import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Facebook-style vertical repositioning for a banner rendered with `object-fit: cover`.
 *
 * Nothing is re-encoded: the caller stores the resulting `object-position` percentage, so a crop
 * can be re-adjusted forever. Shared by the profile editor and the in-place control on the public
 * profile page so both feel — and crop — identically.
 */
export function useBannerDrag(offsetY: number, onChange: (next: number) => void) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startY: number; startOffset: number; overflow: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [adjustable, setAdjustable] = useState(true);

  /**
   * How many pixels of the image hang outside the box vertically. `cover` only leaves vertical
   * slack when scaling to the box width makes the image taller than the box; a very wide image is
   * cropped horizontally instead and has nothing to move.
   */
  const verticalOverflow = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return 0;
    return img.clientWidth * (img.naturalHeight / img.naturalWidth) - img.clientHeight;
  }, []);

  const measure = useCallback(() => {
    setAdjustable(verticalOverflow() > 1);
  }, [verticalOverflow]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const overflow = verticalOverflow();
      if (overflow <= 1) {
        setAdjustable(false);
        return;
      }
      dragRef.current = { startY: e.clientY, startOffset: offsetY, overflow };
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [offsetY, verticalOverflow]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Scaled by the overflow so the image tracks the cursor 1:1 instead of racing ahead of it.
      const next = drag.startOffset - ((e.clientY - drag.startY) / drag.overflow) * 100;
      onChange(Math.round(Math.min(100, Math.max(0, next))));
    },
    [onChange]
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  return {
    imgRef,
    dragging,
    /** False when the image has no vertical slack, so the UI can say so instead of ignoring drags. */
    adjustable,
    /** Re-checks `adjustable`; call on image load and whenever the box becomes visible. */
    measure,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
