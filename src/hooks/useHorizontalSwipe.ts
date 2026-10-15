'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react';
import { getSwipeAxis, getSwipeDirection } from '@/lib/swipe';
import type { SwipeAxis, SwipeDirection } from '@/lib/swipe';

type Gesture = {
  pointerId: number;
  startX: number;
  startY: number;
  axis: SwipeAxis;
  surface: HTMLElement;
};

type SwipeHandlers = Pick<HTMLAttributes<HTMLElement>,
  'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  | 'onLostPointerCapture' | 'onPointerLeave' | 'onClickCapture'>;

const INTERACTIVE_TARGET = 'button, a, input, select, textarea, [role="button"], [contenteditable]:not([contenteditable="false"]), [data-no-swipe]';
const CLICK_GUARD_MS = 800;

/** Spread onto one surface with CSS touch-action: pan-y pinch-zoom. */
export function useHorizontalSwipe(
  onSwipe: (direction: SwipeDirection) => void,
  disabled = false,
): SwipeHandlers {
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);

  const clearGesture = useCallback((guardClick = true) => {
    const active = gesture.current;
    gesture.current = null;
    if (!active) return;
    if (guardClick && active.axis === 'horizontal') {
      suppressClickUntil.current = performance.now() + CLICK_GUARD_MS;
    }
    // Clear our state first: releasePointerCapture emits lostpointercapture.
    try {
      if (active.surface.hasPointerCapture(active.pointerId)) {
        active.surface.releasePointerCapture(active.pointerId);
      }
    } catch {
      // A detached surface or a browser-cancelled pointer is already released.
    }
  }, []);

  useEffect(() => {
    // A second finger may land outside this surface; never turn a page while zooming.
    const onAdditionalPointer = (event: PointerEvent) => {
      if (gesture.current && event.pointerId !== gesture.current.pointerId) clearGesture();
    };
    // Pending (uncaptured) pointers can finish outside the React surface.
    const onPointerEnd = (event: PointerEvent) => {
      if (gesture.current?.pointerId === event.pointerId) clearGesture();
    };
    const onBlur = () => clearGesture();
    window.addEventListener('pointerdown', onAdditionalPointer, true);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointerdown', onAdditionalPointer, true);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', onBlur);
      clearGesture(false);
      suppressClickUntil.current = 0;
    };
  }, [clearGesture]);

  useEffect(() => {
    if (disabled) clearGesture();
  }, [disabled, clearGesture]);

  const cancelPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId === event.pointerId) clearGesture();
  };

  return {
    onPointerDown(event) {
      if (disabled || !event.isPrimary || event.button !== 0) return;
      // A new intentional tap should not inherit the previous drag's click guard.
      suppressClickUntil.current = 0;
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest(INTERACTIVE_TARGET);
      if (target?.closest('[data-no-swipe]')) return;
      if (control && !control.matches('[data-swipe-title]')) return;
      clearGesture(false);
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        axis: 'pending',
        surface: event.currentTarget,
      };
    },
    onPointerMove(event) {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (disabled) { clearGesture(); return; }
      if (active.axis === 'vertical') return;
      if (active.axis === 'pending') {
        active.axis = getSwipeAxis(event.clientX - active.startX, event.clientY - active.startY);
        if (active.axis === 'horizontal') {
          // Wait until horizontal intent is clear; never capture an ordinary scroll.
          try { active.surface.setPointerCapture(event.pointerId); } catch { /* Pointer already ended. */ }
        }
      }
      if (active.axis === 'horizontal') event.preventDefault();
    },
    onPointerUp(event) {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const direction = !disabled && active.axis === 'horizontal'
        ? getSwipeDirection(event.clientX - active.startX, event.clientY - active.startY)
        : null;
      clearGesture();
      if (direction !== null) onSwipe(direction);
    },
    onPointerCancel: cancelPointer,
    onLostPointerCapture(event) {
      // Touch starts with implicit capture on the title button. Transferring it
      // to this surface emits a bubbled loss from that child, not this surface.
      if (event.target === event.currentTarget) cancelPointer(event);
    },
    onPointerLeave(event) {
      if (gesture.current?.pointerId === event.pointerId && gesture.current.axis !== 'horizontal') {
        clearGesture(false);
      }
    },
    onClickCapture(event) {
      // Keyboard/assistive clicks have detail=0 and must stay available.
      if (event.detail !== 0 && performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    },
  };
}
