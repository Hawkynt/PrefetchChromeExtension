const settings = {
  defaults: {
    startAfterLoad: true,
    avoidSlowConnections: true,
    avoidDataSaver: true,
    maxConcurrentPrefetchers: 2,
    scanInterval: 3000,
    fadeoutDelay: 5000,
    menuDelay: 5000,
    boostInViewportLinks: true,
    boostMouseOverLinks: true,
    yieldToNavigation: true,
    allowQueryPrefetch: false,
    enableMethodPrefetch: true,
    enableMethodPreconnect: true,
    enableMethodDns: true,
    enableSpeculationRules: false,
    showOverlay: true,
    overlayExpanded: false,
    blacklist: {},
  },

  data: {}, // Stores the current settings

  // Load settings from storage and merge with defaults
  async load() {
    const { defaults } = this;

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      this.data = await new Promise((resolve) => {
        chrome.storage.sync.get(null, (storedData) => {
          resolve({ ...defaults, ...storedData });
        });
      });
    } else {
      // Fallback for localStorage
      this.data = Object.keys(defaults).reduce((acc, key) => {
        const value = localStorage.getItem(key);
        try {
          acc[key] = value !== null ? JSON.parse(value) : defaults[key];
        } catch {
          acc[key] = defaults[key];
        }
        return acc;
      }, {});
    }
    Object.assign(this, this.data); // Expose settings as direct properties
  },

  // Subscribe to live storage changes (e.g. the popup disabling the
  // current site); keeps data/properties in sync before notifying.
  onChanged(callback) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged)
      return;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync")
        return;

      Object.entries(changes).forEach(([key, change]) => {
        this.data[key] = change.newValue;
        this[key] = change.newValue;
      });
      callback(changes);
    });
  },

  // Save current settings to storage
  async save() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      await new Promise((resolve) => {
        chrome.storage.sync.set(this.data, resolve);
      });
    } else {
      // Fallback for localStorage
      Object.keys(this.data).forEach((key) => {
        localStorage.setItem(key, JSON.stringify(this.data[key]));
      });
    }
  },
};
