"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers.js");

function makeLocalStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    store,
  };
}

describe("settings storage", () => {
  test("given chrome.storage, when loading, then stored values override defaults", async () => {
    const stored = { maxConcurrentPrefetchers: 7, showOverlay: false };
    const chrome = {
      storage: {
        sync: {
          get: (_, callback) => callback(stored),
          set: (_, callback) => callback(),
        },
      },
    };
    const env = loadScripts(["settings.js"], { chrome });

    await env.settings.load();

    assert.equal(env.settings.maxConcurrentPrefetchers, 7);
    assert.equal(env.settings.showOverlay, false);
    assert.equal(env.settings.enableMethodDns, true); // untouched default
  });

  test("given no chrome API, when loading, then localStorage values are used", async () => {
    const localStorage = makeLocalStorage({ scanInterval: "9999" });
    const env = loadScripts(["settings.js"], { chrome: undefined, localStorage });

    await env.settings.load();

    assert.equal(env.settings.scanInterval, 9999);
  });

  test("given corrupt localStorage JSON, when loading, then the default wins instead of crashing", async () => {
    const localStorage = makeLocalStorage({ scanInterval: "{not json" });
    const env = loadScripts(["settings.js"], { chrome: undefined, localStorage });

    await env.settings.load();

    assert.equal(env.settings.scanInterval, env.settings.defaults.scanInterval);
  });

  test("given changed data, when saving without chrome API, then localStorage receives it", async () => {
    const localStorage = makeLocalStorage();
    const env = loadScripts(["settings.js"], { chrome: undefined, localStorage });

    await env.settings.load();
    env.settings.data.menuDelay = 1234;
    await env.settings.save();

    assert.equal(localStorage.store.menuDelay, "1234");
  });

  test("given the defaults, then the overlay toggle exists and defaults to on", () => {
    const env = loadScripts(["settings.js"], { chrome: undefined });
    assert.equal(env.settings.defaults.showOverlay, true);
  });

  test("given a sync storage change, when it arrives, then settings update live and subscribers are notified", async () => {
    let storageListener;
    const chrome = {
      storage: {
        sync: {
          get: (_, callback) => callback({}),
          set: (_, callback) => callback(),
        },
        onChanged: {
          addListener: (listener) => {
            storageListener = listener;
          },
        },
      },
    };
    const env = loadScripts(["settings.js"], { chrome });
    await env.settings.load();

    const notified = [];
    env.settings.onChanged((changes) => notified.push(changes));

    storageListener({ blacklist: { newValue: { "example.com": 0 } } }, "sync");
    assert.deepEqual(env.settings.blacklist, { "example.com": 0 });
    assert.equal(notified.length, 1);

    storageListener({ blacklist: { newValue: {} } }, "local"); // other areas are ignored
    assert.equal(notified.length, 1);
  });
});
