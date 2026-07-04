async function main() {

  await settings.load(); // Load settings

  const manager = new PrefetchManager({
    avoidSlowConnections: settings.avoidSlowConnections,
    avoidDataSaver: settings.avoidDataSaver,
    maxConcurrentPrefetchers: settings.maxConcurrentPrefetchers,
    allowQueryPrefetch: settings.allowQueryPrefetch,
    enableMethodPrefetch: settings.enableMethodPrefetch,
    enableMethodPreload: settings.enableMethodPreload,
    enableMethodModulepreload: settings.enableMethodModulepreload,
    enableMethodPreconnect: settings.enableMethodPreconnect,
    enableMethodDns: settings.enableMethodDns,
    enableSpeculationRules: settings.enableSpeculationRules,
  });

  // Controller Logic
  if (settings.showOverlay) {
    const ui = new PrefetchUI(settings.fadeoutDelay, settings.menuDelay);
    manager.onResourceQueued((resource) => ui.updateTableEntry(resource));
    manager.onResourceUpdated((resource) => ui.updateTableEntry(resource));
    manager.onResourceRemoved((resource) => ui.removeTableEntry(resource));
    ui.onAbortRequested((href) => manager.abortResource(href));
  }

  const initializeManager = () => {
    manager.scanForNewLinks();
    if (settings.boostInViewportLinks)
      manager.setupIntersectionObserver();
  };

  // Per-domain blacklist: suspend all speculative work while this host
  // is covered; temporary entries re-enable themselves on expiry, and
  // popup changes apply immediately via the storage change feed.
  const currentHost = location.hostname;
  let blacklistTimer = null;
  const applyBlacklistState = () => {
    clearTimeout(blacklistTimer);
    const now = Date.now();
    const wasSuspended = manager.suspended;
    manager.suspended = Blacklist.covers(settings.blacklist, currentHost, now);

    if (manager.suspended) {
      manager.cancelAll();
      const expiry = Blacklist.expiryFor(settings.blacklist, currentHost);
      if (expiry !== Blacklist.PERMANENT)
        blacklistTimer = setTimeout(applyBlacklistState, expiry - now + 1000);
    } else if (wasSuspended) {
      initializeManager();
    }
  };
  applyBlacklistState();
  settings.onChanged(() => applyBlacklistState());

  // Setup mouse-over boosting if enabled
  if (settings.boostMouseOverLinks)
    manager.setupMouseOverBoost();

  // Cancel all speculative work the moment the user navigates away
  if (settings.yieldToNavigation)
    manager.setupCancelOnNavigation();

  // Scan interval handling
  if (settings.scanInterval > 0)
    setInterval(initializeManager, settings.scanInterval);

  if (settings.startAfterLoad && document.readyState !== "complete")
    window.addEventListener("load", initializeManager);
  else
    initializeManager();
}

main();
