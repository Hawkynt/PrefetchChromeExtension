async function main() {
  
  await settings.load(); // Load settings

  const ui = new PrefetchUI(settings.fadeoutDelay, settings.menuDelay);
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
  manager.onResourceQueued((resource) => ui.updateTableEntry(resource));
  manager.onResourceUpdated((resource) => ui.updateTableEntry(resource));
  manager.onResourceRemoved((resource) => ui.removeTableEntry(resource));

  const initializeManager = () => {
    manager.scanForNewLinks();
    if (settings.boostInViewportLinks)
      manager.setupIntersectionObserver();
  };
  
  // Setup mouse-over boosting if enabled
  if (settings.boostMouseOverLinks)
    manager.setupMouseOverBoost();
    
  // Scan interval handling
  if (settings.scanInterval > 0)
    setInterval(initializeManager, settings.scanInterval);
  
  if (settings.startAfterLoad)
    window.addEventListener("load", initializeManager);
  else
    initializeManager();
}

main();