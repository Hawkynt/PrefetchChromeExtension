"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { FakeElement, loadScripts, flushMicrotasks } = require("./helpers.js");

const MINUTE = 60_000;

function makePopupPage({ tabUrl = "https://www.shop.example/products", stored = {} } = {}) {
  const documentListeners = {};
  const elements = {
    hostName: new FakeElement("h1"),
    status: new FakeElement("div"),
    disableControls: new FakeElement("div"),
    scopeSelect: new FakeElement("select"),
    disable5: new FakeElement("button"),
    disable30: new FakeElement("button"),
    disable60: new FakeElement("button"),
    disablePermanent: new FakeElement("button"),
    enableAgain: new FakeElement("button"),
  };

  const doc = {
    addEventListener: (type, handler) => {
      documentListeners[type] = handler;
    },
    getElementById: (id) => elements[id] || null,
    createElement: (tagName) => new FakeElement(tagName),
  };

  const saved = [];
  const chrome = {
    storage: {
      sync: {
        get: (_, callback) => callback(stored),
        set: (data, callback) => {
          saved.push(JSON.parse(JSON.stringify(data)));
          callback();
        },
      },
    },
    tabs: {
      query: (_, callback) => callback([{ url: tabUrl }]),
    },
  };

  const env = loadScripts(["blacklist.js", "settings.js", "popup.js"], {
    document: doc,
    chrome,
    setTimeout,
    Date,
  });

  return { env, elements, documentListeners, saved };
}

describe("popup per-site controls", () => {
  test("given an active site, when disabling for 30 minutes, then a temporary blacklist entry is saved", async () => {
    const { env, elements, documentListeners, saved } = makePopupPage();

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    assert.equal(elements.hostName.textContent, "www.shop.example");
    assert.match(elements.status.textContent, /active/);

    const before = Date.now();
    elements.disable30.dispatchEvent("click");
    await flushMicrotasks();

    const expiry = env.settings.data.blacklist["www.shop.example"];
    assert.ok(expiry >= before + 29 * MINUTE && expiry <= Date.now() + 31 * MINUTE);
    assert.equal(saved.length, 1);
    assert.match(elements.status.textContent, /disabled for www\.shop\.example until/);
  });

  test("given a permanently disabled parent domain, when re-enabling, then the covering entry is removed", async () => {
    const { env, elements, documentListeners } = makePopupPage({
      stored: { blacklist: { "shop.example": 0 } },
    });

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    assert.match(elements.status.textContent, /disabled/);
    assert.equal(elements.disableControls.style.display, "none");

    elements.enableAgain.dispatchEvent("click");
    await flushMicrotasks();

    assert.deepEqual(env.settings.data.blacklist, {});
    assert.match(elements.status.textContent, /active/);
  });

  test("given permanent disabling, when clicked, then the entry has no expiry", async () => {
    const { env, elements, documentListeners } = makePopupPage();

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    elements.disablePermanent.dispatchEvent("click");
    await flushMicrotasks();

    assert.equal(env.settings.data.blacklist["www.shop.example"], 0);
  });

  test("given the scope selector, when the popup opens, then it offers host and parent domains, most specific first", async () => {
    const { elements, documentListeners } = makePopupPage();

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    assert.deepEqual(
      elements.scopeSelect.children.map((option) => option.value),
      ["www.shop.example", "shop.example"]
    );
  });

  test("given a parent-domain scope is selected, when disabling, then the entry is stored for that domain", async () => {
    const { env, elements, documentListeners } = makePopupPage();

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    elements.scopeSelect.value = "shop.example";
    elements.disablePermanent.dispatchEvent("click");
    await flushMicrotasks();

    assert.deepEqual(env.settings.data.blacklist, { "shop.example": 0 });
    assert.match(elements.status.textContent, /shop\.example/);
  });

  test("given a non-web page, when the popup opens, then the controls are hidden", async () => {
    const { elements, documentListeners } = makePopupPage({ tabUrl: "chrome://extensions" });

    documentListeners.DOMContentLoaded();
    await flushMicrotasks();

    assert.equal(elements.disableControls.style.display, "none");
    assert.equal(elements.enableAgain.style.display, "none");
  });
});
