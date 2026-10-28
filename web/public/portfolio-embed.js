/* Public portfolio embed protocol v1. No credentials or application records are shared. */
(() => {
  if (window.parent === window) return;
  const allowedParents = new Set([
    'https://shahyan-khalid-360.vercel.app',
    'http://127.0.0.1:3000',
  ]);
  let verifiedParent = null;

  function visible(element) {
    return element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden' &&
      getComputedStyle(element).display !== 'none';
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !allowedParents.has(event.origin) ||
        !data || data.type !== 'shahyan:embed:ping' || data.version !== 1 ||
        typeof data.session !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(data.session)) return;

    // A load event is insufficient: wait for meaningful, rendered application UI.
    const controls = [...document.querySelectorAll('h1,h2,main button,form input,app-root button,#root a')];
    if (!controls.some(visible) || document.documentElement.dataset.portfolioReady !== 'true') return;

    const authRoute = /\/(?:login|sign-?in|auth)(?:\/|$)/i.test(window.location.pathname);
    const demoEntry = [...document.querySelectorAll('button,a')].some(element =>
      visible(element) && /explore demo workspace/i.test(element.textContent || ''));
    verifiedParent = { origin: event.origin, session: data.session };
    window.parent.postMessage({
      type: 'shahyan:embed:ready',
      version: 1,
      session: data.session,
      access: authRoute && !demoEntry ? 'restricted' : 'public',
    }, event.origin);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && verifiedParent) {
      window.parent.postMessage({
        type: 'shahyan:embed:escape',
        version: 1,
        session: verifiedParent.session,
      }, verifiedParent.origin);
    }
  });
})();

