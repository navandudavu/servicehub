import { useEffect, useRef } from 'react';

/**
 * Background refresh: calls `tick` every `intervalMs` while the tab is visible, and once more
 * right away when the tab becomes visible or focused again (so coming back to the window shows
 * fresh data immediately). It never overlaps itself: if the previous tick is still running the
 * next one is skipped.
 *
 * `tick` must be silent: no spinners, no error banners. A failed refresh is ignored, the next
 * one simply tries again. The latest `tick` is always used, so it may read current state.
 */
export function usePolling(tick: () => Promise<void> | void, intervalMs: number, enabled = true) {
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    if (!enabled) return;
    let running = false;

    const run = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try { await latest.current(); } catch { /* background refresh: ignore, try again next time */ } finally { running = false; }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    const id = window.setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [intervalMs, enabled]);
}
