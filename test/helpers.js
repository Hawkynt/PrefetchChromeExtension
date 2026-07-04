"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/**
 * Minimal DOM element stand-in: just enough surface for the extension's
 * scripts (createElement, appendChild, listeners, dataset, style).
 */
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = "";
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(type, handler, options) {
    (this.listeners[type] = this.listeners[type] || []).push({
      handler,
      once: Boolean(options && options.once),
    });
  }

  dispatchEvent(type, event) {
    const registered = this.listeners[type] || [];
    this.listeners[type] = registered.filter((entry) => !entry.once);
    registered.forEach((entry) => entry.handler(event));
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  hasAttribute(name) {
    return name in this.attributes;
  }

  closest() {
    return null;
  }
}

/** Create an <a href> stand-in as scanForNewLinks would see it. */
function makeAnchor(href, attributes = {}) {
  const anchor = new FakeElement("a");
  anchor.href = href;
  anchor.closest = (selector) => (selector === "a[href]" ? anchor : null);
  Object.entries(attributes).forEach(([name, value]) => anchor.setAttribute(name, value));
  return anchor;
}

function makeDocument() {
  const listeners = {};
  const doc = {
    head: new FakeElement("head"),
    body: new FakeElement("body"),
    links: [],
    createElement: (tagName) => new FakeElement(tagName),
    querySelectorAll: (selector) => (selector === "a[href]" ? doc.links : []),
    readyState: "complete",
    addEventListener: (type, handler) => {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    dispatchEvent: (type, event) => {
      (listeners[type] || []).forEach((handler) => handler(event));
    },
  };
  return doc;
}

/** A plain unmodified left-click event on the given element. */
function makeClickEvent(target, overrides = {}) {
  return {
    target,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...overrides,
  };
}

function makeLocation(href = "https://example.com/page") {
  const url = new URL(href);
  return {
    href: url.href,
    origin: url.origin,
    hostname: url.hostname,
    pathname: url.pathname,
    search: url.search,
  };
}

const EXPORTS = [
  "Priority",
  "State",
  "Method",
  "Resource",
  "PrefetchManager",
  "PrefetchUI",
  "settings",
  "Blacklist",
];

/**
 * Load extension scripts the way the browser does: shared global scope,
 * in manifest order. `globals` supplies document/location/etc.
 */
function loadScripts(files, globals = {}) {
  const code = files
    .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
    .join("\n;\n");
  const epilogue =
    "\n;return {" +
    EXPORTS.map((name) => `${name}: typeof ${name} === "undefined" ? undefined : ${name}`).join(",") +
    "};";

  const names = Object.keys(globals);
  const factory = new Function(...names, code + epilogue);
  return factory(...names.map((name) => globals[name]));
}

/** Standard browser-ish global set for manager tests. */
function makeBrowserGlobals(overrides = {}) {
  const doc = makeDocument();
  return {
    document: doc,
    location: makeLocation(),
    navigator: {},
    console: { log: () => {} },
    setTimeout,
    clearTimeout,
    URL,
    ...overrides,
  };
}

/** Let queued microtasks/promise chains run. */
async function flushMicrotasks(rounds = 5) {
  for (let i = 0; i < rounds; ++i)
    await Promise.resolve();
}

module.exports = {
  FakeElement,
  makeAnchor,
  makeClickEvent,
  makeDocument,
  makeLocation,
  makeBrowserGlobals,
  loadScripts,
  flushMicrotasks,
};
