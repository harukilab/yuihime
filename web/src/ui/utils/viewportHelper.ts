/**
 * Helper to handle dynamic browser viewport scaling and bypass benign ResizeObserver notifications.
 */

export function setupResizeObserverAndViewport() {
  if (typeof window === 'undefined') return;

  // Bypass ResizeObserver notifications in development & production
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (
      args[0]?.includes?.('ResizeObserver loop completed with undelivered notifications') || 
      args[0]?.includes?.('ResizeObserver loop limit exceeded')
    ) {
      return;
    }
    originalError.apply(console, args);
  };

  window.addEventListener('error', (e) => {
    if (
      e.message?.includes?.('ResizeObserver loop completed with undelivered notifications') || 
      e.message?.includes?.('ResizeObserver loop limit exceeded')
    ) {
      e.stopImmediatePropagation();
    }
  });

  // Calculate high accuracy viewport height for mobile keyboards of scaled documents
  const setVh = () => {
    let scaleVal = 1;
    if (typeof document !== 'undefined') {
      const activeScale = document.documentElement.style.getPropertyValue('--ui-scale');
      if (activeScale) {
        const parsed = parseFloat(activeScale);
        if (!isNaN(parsed) && parsed > 0) {
          scaleVal = parsed;
        }
      }
    }
    const vh = (window.innerHeight * 0.01) / scaleVal;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };

  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', setVh);

  // Return a cleanup callback for react effects
  return () => {
    window.removeEventListener('resize', setVh);
    window.removeEventListener('orientationchange', setVh);
  };
}
