"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts, flushMicrotasks } = require("./helpers.js");

const NUMERIC_FIELDS = {
  maxConcurrentPrefetchers: "1",
  scanInterval: "0",
  fadeoutDelay: "100",
  menuDelay: "1000",
};

function makeOptionsPage() {
  const documentListeners = {};
  const formListeners = {};
  const elements = {
    settingsForm: {
      addEventListener: (type, handler) => {
        formListeners[type] = handler;
      },
    },
    statusMessage: {
      textContent: "",
      classList: { add() {}, remove() {} },
    },
  };

  const doc = {
    addEventListener: (type, handler) => {
      documentListeners[type] = handler;
    },
    getElementById: (id) => elements[id] || null,
  };

  const env = loadScripts(["settings.js", "options.js"], {
    document: doc,
    chrome: undefined,
    localStorage: { getItem: () => null, setItem: () => {} },
    setTimeout,
  });

  // Build one input per setting, mirroring options.html
  // (blacklist has no form input; it is managed via its own list).
  Object.keys(env.settings.defaults).filter((key) => key !== "blacklist").forEach((key) => {
    elements[key] =
      key in NUMERIC_FIELDS
        ? { type: "number", value: "", min: NUMERIC_FIELDS[key] }
        : { type: "checkbox", checked: false };
  });

  return { env, elements, documentListeners, formListeners };
}

describe("options form validation", () => {
  test("given invalid and out-of-range numbers, when saving, then defaults and clamping apply", async () => {
    const { env, elements, documentListeners, formListeners } = makeOptionsPage();

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    elements.scanInterval.value = "-500";        // below min -> clamped to 0
    elements.maxConcurrentPrefetchers.value = ""; // empty -> NaN -> default
    elements.fadeoutDelay.value = "banana";       // garbage -> NaN -> default
    elements.menuDelay.value = "2500";            // valid -> kept

    await formListeners.submit({ preventDefault() {} });
    await flushMicrotasks();

    assert.equal(env.settings.data.scanInterval, 0);
    assert.equal(env.settings.data.maxConcurrentPrefetchers, env.settings.defaults.maxConcurrentPrefetchers);
    assert.equal(env.settings.data.fadeoutDelay, env.settings.defaults.fadeoutDelay);
    assert.equal(env.settings.data.menuDelay, 2500);
  });

  test("given the stored values, when the page loads, then inputs are populated from settings", async () => {
    const { env, elements, documentListeners } = makeOptionsPage();

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    assert.equal(String(elements.scanInterval.value), String(env.settings.defaults.scanInterval));
    assert.equal(elements.showOverlay.checked, env.settings.defaults.showOverlay);
  });
});
