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
    allowQueryPrefetch: false,
    enableMethodPrefetch: true,
    enableMethodPreload: true,
    enableMethodPreconnect: true,
    enableMethodDns: true,
    enableMethodModulepreload: true,
    enableSpeculationRules: false,
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
        acc[key] = value !== null ? JSON.parse(value) : defaults[key];
        return acc;
      }, {});
    }
    Object.assign(this, this.data); // Expose settings as direct properties
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
