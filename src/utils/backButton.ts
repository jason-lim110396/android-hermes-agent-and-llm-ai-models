// Android hardware back button support.
//
// In a Capacitor WebView the default back behavior is a browser-style
// history pop. This app is a single-page tab UI with no history entries,
// so without a listener the hardware back button instantly backgrounds
// the whole app - even when a modal is open on screen, mid-edit.
//
// This module keeps a LIFO stack of "close the top overlay" callbacks.
// The Android back button first closes the top-most modal (the behavior
// every other Android app has), and only exits the app when nothing is
// open - the standard back-at-root convention. On a plain web browser
// the Capacitor listener never fires, so the module is inert there.

import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';

type BackHandler = () => void;

// Ordered by open time: the last entry is the top-most overlay.
const handlerStack: BackHandler[] = [];

/**
 * Register a closer for an open overlay. Returns an unregister function;
 * calling it twice is a no-op. Handlers are matched by identity, so an
 * inline arrow registered once per open is fine.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlerStack.push(handler);
  return () => {
    const i = handlerStack.lastIndexOf(handler);
    if (i !== -1) handlerStack.splice(i, 1);
  };
}

let listening = false;

/**
 * Idempotent, client-only: wire the Android hardware back button to the
 * handler stack. Each press closes the top-most open overlay; when the
 * stack is empty the app is exited, matching Android's back-at-root
 * convention (the pre-fix behavior exited unconditionally).
 */
export function initAndroidBackButton(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  try {
    CapApp.addListener('backButton', () => {
      // Pop before calling: the closer is expected to flip the modal's
      // isOpen, whose effect cleanup would otherwise be a no-op (the
      // handler is already out of the stack). If a closer ever throws
      // or fails to close its modal, the next press still makes
      // progress instead of pressing the same dead handler forever.
      const top = handlerStack.pop();
      if (top) {
        try {
          top();
        } catch (_) {}
      } else {
        try {
          CapApp.exitApp();
        } catch (_) {}
      }
    });
  } catch (_) {
    // No native bridge (plain web): nothing to listen to.
    listening = false;
  }
}

/**
 * Modal-side wiring: while `isOpen`, pressing the Android hardware back
 * button calls `onClose` instead of backgrounding the whole app. The
 * closer is read through a ref so a new inline `onClose` lambda per
 * parent render never reorders the stack - registration happens exactly
 * once per open, in open order, keeping the LIFO order correct even
 * when two overlays are open at once.
 */
export function useBackButtonClose(isOpen: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    return pushBackHandler(() => {
      closeRef.current();
    });
  }, [isOpen]);
}
